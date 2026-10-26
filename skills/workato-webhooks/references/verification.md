# How to Authenticate Workato HTTP Connector Requests

## How It Works

Workato **does not sign requests**: there is no HMAC, timestamp or signature header. The HTTP
connection's **Basic** authentication adds:

```
Authorization: Basic base64(username:password)
```

| Workato field | Env var in the examples |
|---------------|-------------------------|
| Basic auth user | `WORKATO_WEBHOOK_USERNAME` |
| Basic auth password | `WORKATO_WEBHOOK_PASSWORD` |

**A static shared credential authenticates the sender, not the body, and gives no replay
protection** (there is no signature and no timestamp). Anyone who captures a request can
resend it, or send a different body with the same header. Use HTTPS only, rotate the password
if it leaks, and dedupe on an id from the body if replays matter.

## Implementation

There's no SDK. Verification is: parse the header, split on the first colon, and compare the
username and password each in constant time, evaluating both before deciding.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

// timingSafeEqual needs equal-length buffers, so check lengths first.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function verifyWorkatoRequest(headers, user, password) {
  if (!user || !password) return false;
  const m = (headers['authorization'] || '').match(/^Basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i);
  if (!m) return false;
  const decoded = Buffer.from(m[1].trim(), 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep === -1) return false;
  const userOk = safeEqual(decoded.slice(0, sep), user);
  const passwordOk = safeEqual(decoded.slice(sep + 1), password);
  return userOk && passwordOk;
}
```

### Python (FastAPI)

```python
import base64, binascii, hmac, re

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_workato_request(headers, user, password) -> bool:
    if not user or not password:
        return False
    m = re.match(r"^Basic\s+([A-Za-z0-9+/]+={0,2})\s*$", headers.get("authorization") or "", re.IGNORECASE)
    if not m:
        return False
    try:
        decoded = base64.b64decode(m.group(1), validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return False
    if ":" not in decoded:
        return False
    req_user, req_password = decoded.split(":", 1)
    user_ok = safe_equal(req_user, user)
    password_ok = safe_equal(req_password, password)
    return user_ok and password_ok
```

In FastAPI, wrap this in a dependency (`Depends(require_workato_auth)`) so the route never
runs for unauthenticated requests.

## Common Gotchas

- **Don't use `===` / `==`.** Plain comparison returns early on the first differing character.
  Use `crypto.timingSafeEqual` / `hmac.compare_digest`.
- **`timingSafeEqual` throws on unequal lengths.** Check lengths first (as above) or compare
  SHA-256 digests of both sides.
- **`hmac.compare_digest` raises `TypeError` on non-ASCII `str`.** Always encode both sides to
  bytes.
- **Don't short-circuit.** Compute both the username and password comparisons before combining
  them, so timing doesn't reveal which one was wrong.
- **Split on the first colon only.** The username can't contain `:`, but the password can.
- **The scheme is case-insensitive.** Match `Basic` / `basic` / `BASIC`.
- **Empty credentials.** If either env var is unset, reject everything. Never compare against
  an empty string.
- **Any method, any content type.** The HTTP action's method is user-chosen and a `GET` has no
  body. Authenticate every method, and read the body raw (`express.raw({ type: '*/*' })`) so
  the content type doesn't matter. Parse JSON only after the credential check.
- **HTTPS only.** Basic auth is just base64 encoding; plain HTTP exposes the password.

## Debugging Authentication Failures

| Symptom in Workato | Likely cause |
|--------------------|--------------|
| `401` on every job | Username or password in the HTTP connection differs from your `.env` (watch for trailing whitespace/newlines) |
| `401` and the connection uses a different auth type | Connection **Authentication type** isn't **Basic** (None sends no header) |
| `400 Invalid JSON body` | Request body isn't a JSON object, or the mapped JSON is invalid |
| `404` | Request URL path doesn't match `/webhooks/workato` |
| Connection refused / timeout | Workato can't reach `localhost`: use a public URL or `npx hookdeck-cli listen` |

Check the step's output in the job history for the exact status and response body.
