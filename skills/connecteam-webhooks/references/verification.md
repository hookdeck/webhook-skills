# How to Verify Connecteam Webhook Requests

## How Does Connecteam Authenticate Webhooks?

Connecteam does not sign payloads. Its docs say: "When `secretKey` is set, Connecteam sends that exact value in the `x-webhook-secret` header. It does not sign or hash the request body."

```
x-webhook-secret: your-secretKey
```

There is no HMAC, timestamp or prefix. Compare the whole header value with the secret you stored. Webhooks created without a `secretKey` send no header, so there is nothing to verify.

> Set a secretKey when you create the webhook through the Connecteam API. Webhooks without one send nothing to verify.

## What Does This Protect Against?

A static shared credential authenticates the sender, not the body, and gives no replay protection (no signature, no timestamp). Anyone who captures a request can replay it, or send a different body with the same header. Use HTTPS so the header isn't exposed in transit, rotate the `secretKey` if it leaks, and make handlers idempotent (key on `requestId`).

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyConnecteamRequest(headers, secret = process.env.CONNECTEAM_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers['x-webhook-secret'];
  return Boolean(received) && safeEqual(received, secret);
}
```

`timingSafeEqual` throws on buffers of different lengths, so hash both sides first (or check lengths).

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_connecteam_request(headers, secret=None) -> bool:
    secret = secret or os.environ.get("CONNECTEAM_WEBHOOK_SECRET")
    received = headers.get("x-webhook-secret")
    return bool(secret and received and safe_equal(received, secret))
```

Encode both sides to bytes: `hmac.compare_digest` raises `TypeError` on a non-ASCII `str`.

## Common Gotchas

- **Check every method first.** The docs don't name the method outside the Chat guide (POST), so the examples accept GET, POST, PUT, PATCH and DELETE and authenticate before reading the body.
- **Empty bodies.** Return 200 for an authenticated request with no body.
- **Raw body, any content type.** In Express use `express.raw({ type: '*/*' })`; parse only after the check.
- **Whole value.** Don't strip or split the header; compare it exactly.
- **Fail closed.** If `CONNECTEAM_WEBHOOK_SECRET` is unset, reject everything rather than comparing against an empty string.
- **Hookdeck source.** Hookdeck's Connecteam source uses API key verification on `x-webhook-secret` and pre-selects POST without managing the method; allow any other method the sender uses.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401, header missing | The webhook was created without a `secretKey` |
| 401, header present | `CONNECTEAM_WEBHOOK_SECRET` differs from the webhook's `secretKey` (whitespace, rotated value) |
| 401 on every request | `CONNECTEAM_WEBHOOK_SECRET` not loaded in the environment |
| 405 from your framework | The sender uses a method your route doesn't accept |
| Connecteam stops delivering | A 404 is treated as permanent; check the route path |
