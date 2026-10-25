# How to Verify Swoogo Webhook Requests

## How Does Swoogo Authenticate Webhooks?

Swoogo does not sign payloads. There is no HMAC and no timestamp. Instead, you add a custom header
to the webhook (`headers: [{key, value}]`) and your endpoint checks that header on every request.
The header name is your choice, so it is configured with `SWOOGO_WEBHOOK_HEADER` (default
`Authorization`); the expected value is `SWOOGO_WEBHOOK_SECRET`.

```
Authorization: Bearer your-secret
```

This matches Hookdeck's Swoogo source: header name plus the exact whole value.

> **Limits.** A static shared credential authenticates the sender, not the body, and gives no
> replay protection (no signature, no timestamp). Anyone who captures one request can replay it or
> send a different body. Use HTTPS, rotate the credential if it leaks, and make handlers idempotent.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifySwoogoRequest(headers,
    name = process.env.SWOOGO_WEBHOOK_HEADER || 'Authorization',
    secret = process.env.SWOOGO_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_swoogo_request(headers, name=None, secret=None) -> bool:
    name = name or os.environ.get("SWOOGO_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("SWOOGO_WEBHOOK_SECRET")
    received = next((v for k, v in headers.items() if k.lower() == name.lower()), None)
    if not secret or not received:
        return False
    # bytes, never str: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Compare the whole value.** If the webhook header value is `Bearer abc`, then
  `SWOOGO_WEBHOOK_SECRET` is `Bearer abc`. Don't strip or parse the prefix.
- **Header name is yours.** Swoogo has no fixed name. Look it up case-insensitively.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes.
- **Fail closed.** If `SWOOGO_WEBHOOK_SECRET` is unset, reject everything.
- **Two content types.** The body is JSON (`json`) or form-encoded (`post`). Read it raw
  (`express.raw({ type: '*/*' })`), authenticate, then parse by `Content-Type`.
- **Retries.** Non-2xx responses are retried, so a 401 caused by a wrong secret keeps retrying.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret unset, or header name differs from `SWOOGO_WEBHOOK_HEADER` |
| 401 but values look equal | `Bearer ` prefix typed in Swoogo but missing from the env var (or the reverse) |
| 401 only behind a proxy | The proxy strips or renames the header (some strip `Authorization`) |
| 400 after authentication | Body is neither a JSON object nor form fields |
