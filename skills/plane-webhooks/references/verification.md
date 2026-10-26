# How to Verify Plane Webhook Signatures

## How It Works

1. Plane computes HMAC-SHA256 over the **raw request body bytes**, keyed with the webhook's secret key (`plane_wh_...`).
2. It sends the lowercase hex digest in `X-Plane-Signature`: no prefix, no other fields.
3. You recompute the digest over the exact bytes received and compare in constant time.

The key is the secret's UTF-8 bytes, used as-is (not hex- or base64-decoded). Only the body is signed: no timestamp, delivery ID or header is part of the signed content, so there is no replay window to check. Use `event_id` to deduplicate.

## Implementation

Plane has no official webhook-verification SDK for these frameworks, so verification is manual. Plane's docs show the Python form: `hmac.new(secret.encode("utf-8"), request_body_bytes, hashlib.sha256).hexdigest()` compared with `hmac.compare_digest`.

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signature, secret) {
  if (typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature) || !secret) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // safe: format validated above
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

### Python

```python
import hmac, hashlib, re

def verify(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    if not signature or not secret or not re.fullmatch(r"[0-9a-fA-F]{64}", signature, re.ASCII):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.lower().encode("ascii"), expected.encode("ascii"))
```

## Common Gotchas

- **Raw body**: verify the bytes as received. A parsed and re-serialized body changes key order, spacing or escaping and will not match. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.arrayBuffer()`; in FastAPI use `await request.body()`.
- **Validate before decoding**: check the header is exactly 64 hex characters before turning it into bytes. `Buffer.from(value, 'hex')` silently drops bad characters.
- **Whole header value**: the header is one digest. Don't split it on commas or strip a `sha256=` prefix.
- **Case**: hex is case-insensitive, so lowercase the received value before comparing.
- **Compare bytes in constant time**: `crypto.timingSafeEqual` on equal-length Buffers, `hmac.compare_digest` on bytes (a `str` with non-ASCII characters raises).
- **Secret rotation**: **Re-generate key** invalidates the old secret at once. Deliveries signed with the old key will fail until you deploy the new one.
- **Status codes**: respond `401` for a missing, malformed or mismatched signature. Plane doesn't retry `4xx`, but it does retry `5xx`, and disables the webhook after 5 failed attempts, so don't return `500` for anything but a real server fault.
- **Trust nothing in the body**: after verification, check each field's type before reading into it.

## Debugging Verification Failures

- Confirm the secret is the full `plane_wh_...` value from the CSV or the edit form, with no trailing whitespace or newline from the CSV.
- Check that the secret belongs to the same webhook that sent the request (`webhook_id` in the body).
- Make sure no middleware (JSON body parser, proxy rewrite, compression) altered the body before verification.
- Compare lengths: a valid `X-Plane-Signature` is 64 characters.
- If you recently re-generated the key, make sure the new one is deployed.
