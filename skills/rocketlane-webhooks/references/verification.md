# How to Authenticate Rocketlane Webhooks

## How It Works

Rocketlane **does not sign payloads**: there is no HMAC, no signature header and no timestamp.
The only authentication is HTTP Basic auth, configured on the webhook in Settings > Webhooks:

```
Authorization: Basic base64(username:password)
```

Points that cause most failures:

- Choose Basic authentication and set a username and password on the Rocketlane webhook.
- The credentials must arrive on the first request. The docs don't say whether Rocketlane
  sends them preemptively, and Hookdeck never sends a `401` + `WWW-Authenticate` challenge: it
  verifies the request as received.
- Split the decoded value on the **first** colon; the password may contain colons.
- Parse strictly. Accept only the base64 alphabet, so valid credentials followed by junk are rejected.

**What this proves.** A static shared credential authenticates the *sender*, not the *body*,
and gives **no replay protection** (no signature, no timestamp). Anyone who captures one
request can resend it. Use HTTPS, rotate the credential if it leaks, and dedupe on `eventId`.

## Implementation

There is no SDK. Compare the username and the password each in constant time and evaluate
both before deciding (no short-circuit). Hash both sides first so the buffers are equal length.

### Node.js (Express)

```javascript
const crypto = require('crypto');

const safeEqual = (a, b) =>
  crypto.timingSafeEqual(
    crypto.createHash('sha256').update(a).digest(),
    crypto.createHash('sha256').update(b).digest());

function parseBasicAuth(header) {
  const m = /^basic[ \t]+([A-Za-z0-9+/]+={0,2})$/i.exec((header || '').trim());
  if (!m || m[1].length % 4) return null;
  const bytes = Buffer.from(m[1], 'base64');
  if (bytes.toString('base64') !== m[1]) return null;
  let decoded;
  try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
  const i = decoded.indexOf(':');
  return i < 0 ? null : { username: decoded.slice(0, i), password: decoded.slice(i + 1) };
}

app.post('/webhooks/rocketlane', express.raw({ type: '*/*' }), (req, res) => {
  const user = process.env.ROCKETLANE_WEBHOOK_USERNAME;
  const pass = process.env.ROCKETLANE_WEBHOOK_PASSWORD;
  const creds = parseBasicAuth(req.headers['authorization']);
  if (!user || !pass || !creds) return res.status(401).end();
  const userOk = safeEqual(creds.username, user);
  const passOk = safeEqual(creds.password, pass);
  if (!(userOk && passOk)) return res.status(401).end();

  const payload = JSON.parse(req.body.toString('utf8')); // parse only after the check
  res.sendStatus(200);
});
```

### Python (FastAPI)

```python
import base64, binascii, hmac, re

BASIC = re.compile(r"^basic[ \t]+(\S+)$", re.IGNORECASE)

def parse_basic_auth(header):
    m = BASIC.match((header or "").strip())
    if not m:
        return None
    try:
        decoded = base64.b64decode(m.group(1), validate=True)  # strict alphabet
    except (binascii.Error, ValueError):
        return None
    user, sep, password = decoded.partition(b":")              # first colon
    return (user, password) if sep else None

def verify(headers, expected_user, expected_pass):
    creds = parse_basic_auth(headers.get("authorization"))
    if not creds or not expected_user or not expected_pass:
        return False
    # bytes on both sides: compare_digest raises TypeError for non-ASCII str
    user_ok = hmac.compare_digest(creds[0], expected_user.encode("utf-8"))
    pass_ok = hmac.compare_digest(creds[1], expected_pass.encode("utf-8"))
    return user_ok and pass_ok
```

### Next.js (App Router)

Same `parseBasicAuth` and `safeEqual` as the Express version, reading
`request.headers.get('authorization')` and the body with `await request.text()` after the
check. See [examples/nextjs/lib/verify-rocketlane.ts](../examples/nextjs/lib/verify-rocketlane.ts).

## Common Gotchas

- **401 on every request:** the username or password in `.env` differs from Rocketlane, or
  Basic authentication wasn't set on the webhook, so no `Authorization` header is sent.
- **Wrong parsing:** splitting on every colon breaks passwords that contain one.
- **Python `compare_digest` `TypeError`:** you passed `str` with non-ASCII characters; encode to bytes.
- **Express parses the body first:** use `express.raw({ type: '*/*' })` and parse after the check.
- **Delivery shown as failed:** Rocketlane counts only `200` or `204`, with a 10 second timeout.

## Debugging Verification Failures

```bash
# Valid credentials should return 200
curl -i -u "user:pass" -H "Content-Type: application/json" -d '{}' http://localhost:3000/webhooks/rocketlane
# Missing credentials should return 401
curl -i -H "Content-Type: application/json" -d '{}' http://localhost:3000/webhooks/rocketlane
```
