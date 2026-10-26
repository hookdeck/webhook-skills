# How to Verify FourKites Webhook Requests

## How Does FourKites Authenticate Webhooks?

FourKites does not sign payloads: there is no HMAC, timestamp or signature header. You pick an
authentication method when subscribing (Basic Auth, API Key / Auth Header, or OAuth2). This skill
covers **Basic Auth**:

```
Authorization: Basic base64(username:password)
```

**A static shared credential authenticates the sender, not the body, and gives no replay
protection** (no signature, no timestamp). Anyone who captures a request can resend it. Use HTTPS
only, make handlers idempotent, and rotate the credential if it leaks.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

const safeEqual = (a, b) =>
  crypto.timingSafeEqual(
    crypto.createHash('sha256').update(a).digest(),
    crypto.createHash('sha256').update(b).digest()
  );

function verifyFourKitesRequest(headers, user = process.env.FOURKITES_WEBHOOK_USERNAME,
                                pass = process.env.FOURKITES_WEBHOOK_PASSWORD) {
  if (!user || !pass) return false;
  const m = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(headers['authorization'] || '');
  if (!m) return false;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  const userOk = safeEqual(decoded.slice(0, i), user);
  const passOk = safeEqual(decoded.slice(i + 1), pass);
  return userOk && passOk;
}
```

### Python

```python
import base64, hmac, os, re

def verify_fourkites_request(headers, user=None, password=None) -> bool:
    user = user or os.environ.get("FOURKITES_WEBHOOK_USERNAME")
    password = password or os.environ.get("FOURKITES_WEBHOOK_PASSWORD")
    if not user or not password:
        return False
    m = re.fullmatch(r"basic\s+([A-Za-z0-9+/]+={0,2})\s*", headers.get("authorization", ""), re.IGNORECASE)
    if not m:
        return False
    try:
        decoded = base64.b64decode(m.group(1), validate=True)
    except ValueError:
        return False
    got_user, sep, got_pass = decoded.partition(b":")   # split on the FIRST colon
    if not sep:
        return False
    user_ok = hmac.compare_digest(got_user, user.encode("utf-8"))
    pass_ok = hmac.compare_digest(got_pass, password.encode("utf-8"))
    return user_ok and pass_ok
```

## Common Gotchas

- **Credentials must arrive on the first request.** A `401` + `WWW-Authenticate` challenge flow
  won't work through Hookdeck, which verifies the request as received. The docs don't say
  whether FourKites sends Basic credentials preemptively; confirm it with FourKites.
- **Split on the first colon only.** Passwords may contain `:`; usernames may not.
- **Scheme is case-insensitive.** Accept `Basic`, `basic` and `BASIC`.
- **Compare both fields, then decide.** Don't short-circuit on a wrong username.
- **Constant-time compare.** Node: hash both sides (or check lengths) before `timingSafeEqual`,
  which throws on unequal lengths. Python: `hmac.compare_digest` on bytes; passing `str` raises
  `TypeError` on non-ASCII.
- **Fail closed.** If either env var is unset, reject everything.
- **4XX is not retried.** A `401` caused by a rotated credential drops the message; `5XX` retries.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the credential check.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Env vars unset, or FourKites configured with API Key or OAuth2 instead of Basic |
| 401 after credential change | FourKites still holds the old username/password |
| 401 only behind a proxy | The proxy strips the `Authorization` header |
| 400 after authentication | Body isn't a JSON object |
