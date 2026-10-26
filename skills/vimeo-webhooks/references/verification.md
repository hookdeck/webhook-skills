# How to Verify Vimeo Webhook Signatures

## How It Works

When a webhook has a `secret`, Vimeo computes the SHA-256 HMAC of the raw request body with that secret and sends it in the `X-Webhook-Signature` header. Vimeo's docs show the check in PHP:

```php
hash_equals(hash_hmac('sha256', $payload, $secret), $_SERVER['X-Webhook-Signature']);
```

PHP's `hash_hmac` returns lowercase hex by default, so the header is a 64-character lowercase hex string with no prefix. Nothing else is signed: no timestamp, no delivery ID.

The header is only sent for webhooks whose `secret` is not null. Without a secret, deliveries are unsigned.

## Implementation

Vimeo has no webhook verification SDK, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyVimeo(rawBody, signature, secret) {
  // Check format first: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature.toLowerCase()));
}
```

In Express, read the body with `express.raw({ type: '*/*' })` so any content type is captured as a Buffer. In Next.js use `await request.text()`.

### Python

```python
import hashlib, hmac

def verify_vimeo(raw_body: bytes, signature: str | None, secret: str) -> bool:
    if not signature:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode(), signature.lower().encode())
```

`hmac.compare_digest` on `str` raises `TypeError` for non-ASCII input, which would turn a junk header into a 500. Encode both sides to bytes.

## Common Gotchas

- **No secret, no signature.** If the webhook was created without `secret`, there is no `X-Webhook-Signature` header and verification fails. Set one with a POST or PATCH.
- **Raw body only.** Parsing JSON and re-serializing changes the bytes and breaks the HMAC.
- **Any content type.** Read the body as raw bytes regardless of `Content-Type`.
- **Secret mismatch.** The secret is per webhook; if you PATCH a new one, update your environment variable.
- **No replay protection in the signature.** Nothing signed includes a time. The body has a `timestamp` field you can check for freshness, but retries re-deliver old timestamps, so rely on idempotent handlers instead.
- **Invalid hex.** In Node, validate the header is exactly 64 hex chars before decoding it, or compare the lowercase hex strings as UTF-8 buffers as above.

## Debugging Verification Failures

1. Confirm the header arrives: log `X-Webhook-Signature`. If missing, the webhook has no secret (`GET /apps/{app_id}/webhooks/{webhook_id}?fields=secret`).
2. Print the first bytes of the raw body you hash and check they match what was sent (no parsing, no trimming).
3. Compute the HMAC locally with the secret and the captured body and compare.
4. Check the environment variable has no trailing whitespace or quotes.
