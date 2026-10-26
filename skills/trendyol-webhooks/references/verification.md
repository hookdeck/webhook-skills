# How to Verify Trendyol Webhook Requests

## How Does Trendyol Authenticate Webhooks?

Trendyol does not sign payloads. When the webhook is created with `authenticationType`
`API_KEY`, every request carries the `apiKey` you supplied as plain text in the `x-api-key`
header. Compare the whole header value with the key you stored.

```
x-api-key: your-webhook-api-key
```

There is no HMAC, timestamp or prefix. The body is not part of the check, but authenticate
before parsing it. `BASIC_AUTHENTICATION` also exists, but Hookdeck's Trendyol source doesn't
cover it, and this skill doesn't either.

## What This Does and Doesn't Protect

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection**: there is no signature and no timestamp, so anyone who captures a request can replay
it. Use HTTPS, make handlers idempotent, and rotate the `apiKey` (update the webhook and your
`TRENDYOL_WEBHOOK_SECRET`) if it leaks.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyTrendyolRequest(headers, secret = process.env.TRENDYOL_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers['x-api-key'];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_trendyol_request(headers, secret=None) -> bool:
    secret = secret if secret is not None else os.environ.get("TRENDYOL_WEBHOOK_SECRET")
    received = headers.get("x-api-key")
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Compare the whole value.** Don't prefix-match or strip anything from `x-api-key`.
- **Constant-time compare.** Hash both sides (or check lengths first) before `timingSafeEqual`,
  which throws on unequal lengths. In Python, `hmac.compare_digest` needs `bytes` for non-ASCII
  input; passing `str` raises `TypeError`.
- **Fail closed.** If `TRENDYOL_WEBHOOK_SECRET` is unset, reject everything.
- **Case-insensitive header lookup.** Frameworks lowercase header names; use their accessors.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the key check.
- **Failures are retried every 5 minutes.** Return 401 only for bad credentials; a wrong key will
  keep failing and eventually gets the webhook deactivated.
- **Wrong authentication type.** A webhook created with `BASIC_AUTHENTICATION` sends an
  `Authorization` header and no `x-api-key`, so this check returns 401.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `TRENDYOL_WEBHOOK_SECRET` unset, or differs from the webhook's `apiKey` |
| 401 and no `x-api-key` in the request | Webhook was created with `BASIC_AUTHENTICATION`; recreate it with `API_KEY` |
| 401 only behind a proxy | The proxy strips or renames `x-api-key` |
| Webhook became inactive | Repeated failures; fix the endpoint and reactivate it |
| 400 after authentication | Body isn't a JSON object with a `content` array |
