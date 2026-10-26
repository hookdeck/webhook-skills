# How to Verify Paragon Webhook Requests

## How Does Paragon Authenticate Webhooks?

It doesn't sign them. There is no signature header, no HMAC and no timestamp. Instead you add a
header to the Webhook Destination (**Show more request options**) and check that header on
receipt. Name and value are yours to choose, so the examples read the name from
`PARAGON_WEBHOOK_HEADER` (default `Authorization`) and the expected value from
`PARAGON_WEBHOOK_SECRET`.

```
Authorization: Bearer your-shared-secret
```

`PARAGON_WEBHOOK_SECRET` is the exact, whole header value, including any `Bearer ` prefix. Look
the header up case-insensitively and compare the **whole** value. Do not strip or parse `Bearer `.

This matches Hookdeck's Paragon source, which verifies the header name and exact value (API key
verification).

## Security Limits

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp). Anyone who captures one request can replay it or reuse
the credential. Use HTTPS only, and rotate the credential if it leaks.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyParagonRequest(headers, secret = process.env.PARAGON_WEBHOOK_SECRET,
                              headerName = process.env.PARAGON_WEBHOOK_HEADER || 'Authorization') {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

Hashing both sides makes the buffers equal length, so `timingSafeEqual` can't throw. (Checking
lengths first and then comparing equal-length buffers also works.)

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    # compare_digest on bytes: str raises TypeError on non-ASCII input
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )

def verify_paragon_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("PARAGON_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("PARAGON_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False
    wanted = header_name.lower()
    received = next((v for k, v in headers.items() if k.lower() == wanted), None)
    return bool(received) and safe_equal(received, secret)
```

## Common Gotchas

- **Raw body, any content type.** In Express use `express.raw({ type: '*/*' })` and `JSON.parse`
  only after the credential check. `express.json()` skips non-JSON content types and can hide
  the body.
- **Whole value.** If you typed `Bearer abc` in Paragon, the env var must be `Bearer abc`. Setting
  it to `abc` fails by design.
- **Header name.** If you didn't use `Authorization`, set `PARAGON_WEBHOOK_HEADER`.
- **Custom payload.** If you edited the Request Payload template, there may be no `type` field.
- **Auto-disable.** Many consecutive non-2xx responses (including your 401s) can disable the
  destination.
- **Fail closed.** With no secret configured, every request is rejected.

## Debugging 401s

1. Log the header names you receive (not values) and confirm your header arrives.
2. Compare lengths of the stored and received values; a stray quote, newline or missing `Bearer `
   prefix in the env var is the usual cause.
3. Re-send with **Test Webhook** after changing the destination header.
4. Check you restarted the app after changing `.env`.
