# How to Verify Braze Webhook Requests

## Does Braze Sign Webhooks?

No. There is no HMAC, signature header or timestamp. Braze authenticates its requests with a
**Basic authentication credential** you attach to the webhook (Settings > Credential Management).
Braze applies it when sending: Basic authentication supplies the `Authorization` header.

```
Authorization: Basic base64(username:password)
```

> **A static shared credential authenticates the sender, not the body, and gives no replay
> protection.** It doesn't prove the body wasn't altered and doesn't expire, and a captured request
> can be sent again. Use HTTPS only and rotate the credential if it leaks. Make handlers idempotent.

## Implementation

Parse the header (scheme case-insensitive), base64-decode, split on the **first** colon, then
compare the username and the password each in constant time. Evaluate both before deciding.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function parseBasicAuth(header) {
  if (typeof header !== 'string') return null;
  const m = /^basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec(header.trim());
  if (!m) return null;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  return i < 0 ? null : { username: decoded.slice(0, i), password: decoded.slice(i + 1) };
}

function verifyBrazeRequest(headers, user = process.env.BRAZE_WEBHOOK_USERNAME,
                            pass = process.env.BRAZE_WEBHOOK_PASSWORD) {
  if (!user || !pass) return false;
  const creds = parseBasicAuth(headers.authorization);
  if (!creds) return false;
  const userOk = safeEqual(creds.username, user);
  const passOk = safeEqual(creds.password, pass);
  return userOk && passOk;
}
```

### Python

```python
import base64, binascii, hmac, os, re

def parse_basic_auth(header):
    m = re.match(r"^basic\s+([A-Za-z0-9+/]+={0,2})$", (header or "").strip(), re.IGNORECASE)
    if not m:
        return None
    try:
        decoded = base64.b64decode(m.group(1), validate=True)
    except (binascii.Error, ValueError):
        return None
    user, sep, password = decoded.partition(b":")
    return (user, password) if sep else None

def verify_braze_request(headers, username=None, password=None) -> bool:
    username = username or os.environ.get("BRAZE_WEBHOOK_USERNAME")
    password = password or os.environ.get("BRAZE_WEBHOOK_PASSWORD")
    creds = parse_basic_auth(headers.get("authorization"))
    if not (username and password and creds):
        return False
    user_ok = hmac.compare_digest(creds[0], username.encode("utf-8"))  # bytes, never str
    pass_ok = hmac.compare_digest(creds[1], password.encode("utf-8"))
    return user_ok and pass_ok
```

## Common Gotchas

- **Fail closed.** If the username or password isn't configured, reject everything rather than
  comparing against `undefined`.
- **Constant-time compare, both fields, no short-circuit.** Don't `return a === b && c === d`.
  `crypto.timingSafeEqual` throws on unequal lengths, so compare SHA-256 digests (or check lengths
  first). `hmac.compare_digest` raises `TypeError` for non-ASCII `str`, so pass bytes.
- **Split on the first colon.** The password may contain colons; the username may not.
- **Raw body.** The body isn't part of the check, but read it raw (`express.raw({ type: '*/*' })`) so
  any content type works, and authenticate before parsing.
- **Don't be POST-only.** The marketer picks the method; accept POST, PUT, PATCH, GET and DELETE,
  and handle an empty body.
- **Accept non-JSON bodies.** Raw text, XML and form data are valid Braze bodies.
- **Token credentials and manual headers aren't covered.** Token authentication sends whatever
  headers were saved in the credential; this skill checks Basic only.
- **Saved credential wins.** If a manually entered header has the same name as one the credential
  supplies, Braze uses the credential's value.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Env vars unset, or the Braze credential has different values |
| No `Authorization` header arrives | No credential selected on the webhook; or the URL hostname doesn't match the credential's allowed domain, so the selection was cleared |
| 401 only behind a proxy | The proxy strips or rewrites the `Authorization` header |
| 401 after rotating the credential | Update `BRAZE_WEBHOOK_USERNAME`/`PASSWORD` to match |
| 401 only for some users or messages | Different campaigns use different credentials |
| Braze stops retrying | `401` is a non-retriable `4xx`; fix the credential, the failed send isn't redelivered |
| 403 from your firewall | Braze outbound IPs are blocked; allowlist them |
