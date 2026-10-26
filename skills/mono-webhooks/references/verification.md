# How to Verify Mono Webhook Requests

## How Does Mono Authenticate Webhooks?

Mono does not sign payloads. Every request includes a `mono-webhook-secret` header whose value
is the webhook secret of your app, which should match the secret you passed when creating the
webhook:

```
mono-webhook-secret: your-webhook-secret
```

There is no HMAC, timestamp or prefix. Compare the **whole header value** with your stored
secret. The raw body is not part of the check, but authenticate before parsing it.

> A static shared credential authenticates the sender, not the body, and gives no replay
> protection (no signature, no timestamp). Use HTTPS, rotate the secret if it leaks, and dedupe
> on `event_id`.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyMonoRequest(headers, secret = process.env.MONO_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers['mono-webhook-secret'];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_mono_request(headers, secret=None) -> bool:
    secret = secret if secret is not None else os.environ.get("MONO_WEBHOOK_SECRET")
    received = headers.get("mono-webhook-secret")
    return bool(secret and received and safe_equal(received, secret))
```

Encode both sides to bytes: `hmac.compare_digest` raises `TypeError` for non-ASCII `str`.

## Common Gotchas

- **Whole value.** The header is the secret itself; there is no `Bearer` or other prefix to strip.
- **Case-insensitive header name.** Node lowercases incoming headers; `Headers.get()` and
  Starlette are case-insensitive.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python, compare bytes.
- **Fail closed.** If `MONO_WEBHOOK_SECRET` is unset, reject everything rather than comparing
  against `undefined`.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the secret check.
- **Dedupe on `event_id`.** It is reused across retries, and a static header gives no replay
  protection, so idempotent handling is your safety net.
- **Return exactly 200.** Other statuses trigger retries with exponential backoff for 48 hours.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `MONO_WEBHOOK_SECRET` unset, or copied from a different app |
| 401 began suddenly | The secret was regenerated; copy the new one |
| 401 only behind a proxy | The proxy strips or renames `mono-webhook-secret` |
| 400 after authentication | Body isn't a JSON object |
| Same event delivered repeatedly | Response wasn't `200`; Mono is retrying |
