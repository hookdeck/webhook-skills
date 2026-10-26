# How to Verify Payroc Webhook Requests

## How Does Payroc Authenticate Webhooks?

Payroc does not sign payloads. Every request includes the subscription's `secret` as plain text in
the `Payroc-Secret` header:

```
Payroc-Secret: your-subscription-secret
```

There is no HMAC, timestamp or prefix. Compare the **whole header value** to your secret.

> **A static shared credential authenticates the sender, not the body, and gives no replay
> protection** (no signature, no timestamp). Anyone who sees the secret can forge requests, and a
> captured request can be replayed. Use HTTPS, dedupe on the CloudEvent `id`, and rotate the
> credential if it leaks.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyPayrocRequest(headers, secret = process.env.PAYROC_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers['payroc-secret'];
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hmac, os

def verify_payroc_request(headers, secret=None) -> bool:
    secret = secret if secret is not None else os.environ.get("PAYROC_WEBHOOK_SECRET")
    received = headers.get("payroc-secret")
    if not secret or not received:
        return False
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Constant-time compare.** `timingSafeEqual` throws on unequal lengths, so check lengths first.
  In Python pass bytes to `hmac.compare_digest`; a non-ASCII `str` raises `TypeError`.
- **Fail closed.** If `PAYROC_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type works, check the
  header, then `JSON.parse`.
- **Return exactly 200.** Any other status triggers up to five retries and then an email to the
  subscription's support address.
- **Dedupe on `id`.** Retries and replays carry the same event `id`.
- **Hosted Payments Page callbacks** are a different mechanism and are not covered here.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `PAYROC_WEBHOOK_SECRET` unset, or differs from the subscription's `secret` |
| 401 after rotating the secret | Only one of the subscription and the env var was updated |
| 401 only behind a proxy | The proxy strips or renames `Payroc-Secret` |
| 400 after authentication | Body isn't a JSON object |
| Repeated deliveries | Handler returned something other than 200 |
