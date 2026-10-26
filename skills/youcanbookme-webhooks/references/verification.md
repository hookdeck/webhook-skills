# How to Authenticate YouCanBookMe Webhook Requests

## Does YouCanBookMe Sign Webhooks?

No. There is no HMAC, signature header or timestamp. You authenticate requests with a secret
**Request Header** key/value that you add to the webhook action. Your endpoint compares that header
with the value you stored.

```
Authorization: Bearer your-secret      <- header name and value are both your choice
```

## What This Does and Doesn't Protect

A static shared credential **authenticates the sender, not the body**, and gives **no replay
protection**: there is no signature over the payload and no timestamp, so anyone who captures a
request can resend it. Mitigate that by:

- serving the endpoint over HTTPS only,
- rotating the credential if it leaks (update both YouCanBookMe and your server),
- making handlers idempotent (see webhook-handler-patterns).

## Implementation

### Node.js

```javascript
const crypto = require('crypto');
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest();

function verifyYoucanbookmeRequest(headers, {
  headerName = process.env.YOUCANBOOKME_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.YOUCANBOOKME_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && crypto.timingSafeEqual(sha256(received), sha256(secret));
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    # Encode to bytes: hmac.compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_youcanbookme_request(headers, header_name=None, secret=None) -> bool:
    header_name = header_name or os.environ.get("YOUCANBOOKME_WEBHOOK_HEADER") or "Authorization"
    secret = secret or os.environ.get("YOUCANBOOKME_WEBHOOK_SECRET")
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Compare the whole value.** If you typed `Bearer abc` as the header value, the expected secret
  is `Bearer abc`. Don't strip or parse a `Bearer ` prefix.
- **Header name is yours.** Read it from `YOUCANBOOKME_WEBHOOK_HEADER` (default `Authorization`)
  and look it up case-insensitively.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes, never `str`.
- **Fail closed.** If the secret is unset, reject everything.
- **Any method, any content type.** Accept `POST`, `PUT`, `PATCH`, `DELETE` and `GET`; read the body
  raw (`express.raw({ type: '*/*' })`); treat an empty body as valid; parse JSON after the check.
- **No trigger name.** Include an `event` field in your template, or the handler can't tell triggers apart.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret unset, wrong header name, or value differs (including a `Bearer ` prefix) |
| 401 began suddenly | The credential was changed on one side only |
| 401 only behind a proxy | The proxy strips or renames the header (some strip `Authorization`) |
| 405 | Route doesn't accept the method you chose in the webhook action |
| 400 after authentication | Non-empty body that isn't a JSON object |
