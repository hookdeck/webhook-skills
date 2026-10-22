# How to Verify FireHydrant Webhook Signatures

## How It Works

FireHydrant computes an HMAC-SHA256 of the raw request body using the webhook's Secret
and sends the **hex digest** in the `fh-signature` header. To verify, compute the same
digest over the raw bytes you received and compare.

- Header: `fh-signature`
- Algorithm: HMAC-SHA256
- Encoding: lowercase hex, with no `sha256=` prefix
- Signed content: the raw request body only (no timestamp, no message ID)
- Key: the Secret you set on the webhook (used as-is, not base64-decoded)

FireHydrant's docs show this pseudocode:

```ruby
signature = request.headers['fh-signature']
body = request.body
secret = 'your webhook secret set above'
if HMAC.hexdigest('sha256', secret, body) == signature
  # request is valid
end
```

There is no official SDK for verification, so all examples verify manually.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyFireHydrant(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hashlib, hmac

def verify_firehydrant(raw_body: bytes, signature: str | None, secret: str) -> bool:
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)
```

## Common Gotchas

- **Use the raw body.** Re-serializing parsed JSON changes whitespace and key order and breaks the digest.
- **Express:** use `express.raw({ type: '*/*' })`, not `express.json()`, so the body is a `Buffer` whatever the `Content-Type`.
- **Next.js:** call `await request.text()` once and verify that string.
- **FastAPI:** call `await request.body()` and do not declare a Pydantic body parameter.
- **No prefix.** The header is the bare hex digest. Don't strip or expect `sha256=`.
- **No timestamp.** The signed content has no timestamp, so FireHydrant signatures can't be checked for freshness. Deduplicate on resource IDs if replays matter.
- **Header case.** HTTP headers are case-insensitive; Node lowercases them (`req.headers['fh-signature']`).
- **Compare in constant time** and guard against length mismatches (`timingSafeEqual` throws on unequal lengths).

## Debugging Verification Failures

- Confirm the Secret in your environment matches the one on the webhook in FireHydrant exactly (no trailing newline or quotes).
- Log the raw body length and compare it with the request size in the FireHydrant or Hookdeck delivery log; a different length means a middleware changed the body.
- Check that no proxy or middleware (body parsers, compression, charset conversion) runs before your verification.
- Recompute with `openssl dgst -sha256 -hmac "$SECRET" -hex` over the exact body bytes.
