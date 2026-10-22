# How to Verify Honeybadger Webhook Requests

## How Does Honeybadger Authenticate Webhooks?

Honeybadger does not sign payloads. Requests for webhooks, source maps and uptime checks include
a `Honeybadger-Token` header: a secret token derived from the project API key. Compare it with
the token from the **API Key** tab of the project settings.

```
Honeybadger-Token: your-token
```

There is no HMAC, timestamp or prefix. The raw body is not part of the check, but authenticate
before parsing it.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyHoneybadgerRequest(headers, token = process.env.HONEYBADGER_TOKEN) {
  if (!token) return false;
  const received = headers['honeybadger-token'];
  return Boolean(received) && safeEqual(received, token);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest()
    )

def verify_honeybadger_request(headers, token=None) -> bool:
    token = token or os.environ.get("HONEYBADGER_TOKEN")
    received = headers.get("honeybadger-token")
    return bool(token and received and safe_equal(received, token))
```

## Common Gotchas

- **Don't use the Bearer token field.** The optional `Authorization: Bearer` value set on the
  integration is only for services that demand an `Authorization` header. Check
  `Honeybadger-Token`, which is sent on every request.
- **Reset API key = new token.** Update `HONEYBADGER_TOKEN` whenever you reset the project API key.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths.
- **Fail closed.** If `HONEYBADGER_TOKEN` is unset, reject everything rather than comparing
  against `undefined`.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the token check.
- **One token per project.** If one endpoint serves several projects, keep a token per project and
  check against each.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `HONEYBADGER_TOKEN` unset, or copied from the wrong project |
| 401 began suddenly | The project API key was reset; copy the new token |
| 401 only behind a proxy | The proxy strips or renames `Honeybadger-Token` |
| 400 after authentication | Body isn't a JSON object |
