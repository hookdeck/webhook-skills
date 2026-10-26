# How to Verify RudderStack Webhook Requests

## How Does RudderStack Authenticate Webhooks?

RudderStack does not sign payloads, and sends no timestamp. With **Basic Auth** selected, the
HTTP Webhook destination sends:

```
Authorization: Basic base64(username:password)
```

Your endpoint authenticates the request by decoding that header and comparing the username and
password with the ones you configured.

**What this does and doesn't give you:** a static shared credential authenticates the *sender*,
not the *body*, and gives **no replay protection** (no signature, no timestamp). Anyone who
captures a request can replay it. Use HTTPS only, and rotate the credential if it leaks.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const hb = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);   // equal-length digests: never throws
}

function parseBasicAuth(header) {
  const m = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(header || '');
  if (!m) return null;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':');                      // split on the FIRST colon
  return i === -1 ? null : { username: decoded.slice(0, i), password: decoded.slice(i + 1) };
}

function verifyRudderstackRequest(headers, config = process.env) {
  const u = config.RUDDERSTACK_WEBHOOK_USERNAME, p = config.RUDDERSTACK_WEBHOOK_PASSWORD;
  if (!u || !p) return false;                          // never accept when unconfigured
  const creds = parseBasicAuth(headers['authorization']);
  if (!creds) return false;
  const userOk = safeEqual(creds.username, u);         // evaluate both, no short-circuit
  const passOk = safeEqual(creds.password, p);
  return userOk && passOk;
}
```

### Python

```python
import base64, binascii, hmac, re

def parse_basic_auth(header):
    m = re.match(r"^basic\s+([A-Za-z0-9+/]+={0,2})\s*$", header or "", re.IGNORECASE)
    if not m:
        return None
    try:
        decoded = base64.b64decode(m.group(1), validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return None
    user, sep, password = decoded.partition(":")         # split on the FIRST colon
    return (user, password) if sep else None

def verify_rudderstack_request(headers, expected_user, expected_pass) -> bool:
    if not expected_user or not expected_pass:
        return False
    creds = parse_basic_auth(headers.get("authorization"))
    if creds is None:
        return False
    # bytes on both sides: compare_digest raises TypeError on non-ASCII str
    user_ok = hmac.compare_digest(creds[0].encode(), expected_user.encode())
    pass_ok = hmac.compare_digest(creds[1].encode(), expected_pass.encode())
    return user_ok and pass_ok
```

## Common Gotchas

- **Not a signature.** There is no HMAC and no raw-body check. Don't look for an
  `X-Signature` header.
- **Scheme is case-insensitive.** Accept `Basic` and `basic`.
- **Split on the first colon.** Passwords may contain colons; usernames can't.
- **Compare both values, constant time, no short-circuit.** Don't `return a && b` on direct
  string compares; compute both results first.
- **Python: encode to bytes.** `hmac.compare_digest` raises `TypeError` for non-ASCII `str`.
- **Fail closed.** If either environment variable is unset, reject everything.
- **Other auth types aren't covered.** Bearer Token and API Key sends a different header.
- **Method and body vary.** The method is user-chosen (a `GET` has no body), so accept
  `POST`, `PUT`, `PATCH`, `GET` and `DELETE`, read the body raw (`express.raw({ type: '*/*' })`)
  and parse JSON only after the credential check.
- **Batches are arrays.** With batching on, the body is a JSON array.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Env vars unset, or the destination uses No Auth / Bearer / API Key |
| 401 only with some passwords | Credentials not split on the first colon, or non-ASCII handling |
| 401 only behind a proxy | The proxy strips the `Authorization` header |
| 400 after authenticating | Body isn't JSON (XML or form format) |
| Handler sees an array | Batching is on; iterate over the array |
