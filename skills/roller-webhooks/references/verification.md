# How to Verify ROLLER Webhook Requests

## How Does ROLLER Authenticate Webhooks?

ROLLER does not sign payloads. It sends the webhook's `authentication.apiKey` as plain text in
the `x-roller-apikey` header. Compare the **whole** header value with the key you registered.

```
x-roller-apikey: your-long-random-value
```

There is no HMAC, timestamp or prefix. The body is not part of the check, but authenticate
before parsing it.

**A static shared credential authenticates the sender, not the body.** An attacker who sees one
request (a log, a proxy) can replay it or forge new ones, and nothing in the request lets you
detect a replay. Use HTTPS, keep the key out of logs, and rotate it if it leaks. Make handlers
idempotent.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

// Hash both sides: equal-length buffers, so timingSafeEqual never throws.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyRollerRequest(headers, apiKey = process.env.ROLLER_WEBHOOK_API_KEY) {
  if (!apiKey) return false;                  // never accept when unconfigured
  const received = headers['x-roller-apikey']; // whole value, plain text
  return Boolean(received) && safeEqual(received, apiKey);
}
```

### Python

```python
import hashlib, hmac, os

def verify_roller_request(headers, api_key=None) -> bool:
    api_key = api_key or os.environ.get("ROLLER_WEBHOOK_API_KEY")
    received = headers.get("x-roller-apikey")
    if not (api_key and received):
        return False
    # compare_digest needs bytes: str raises TypeError on non-ASCII
    return hmac.compare_digest(received.encode("utf-8"), api_key.encode("utf-8"))
```

## Common Gotchas

- **Use a long random key.** The docs' example is a human label; anything guessable is not a secret.
- **Compare the whole value.** No prefix to strip, no scheme.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python pass bytes to `hmac.compare_digest`.
- **Fail closed.** If `ROLLER_WEBHOOK_API_KEY` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted,
  then `JSON.parse` after the credential check.
- **Respond within 10 seconds.** Queue slow work.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `ROLLER_WEBHOOK_API_KEY` unset or different from the registered `apiKey` |
| 401 after re-registering | The key changed; update the variable |
| 401 only behind a proxy | The proxy strips the `x-roller-apikey` header |
| 400 after authentication | Body isn't a JSON object |
