# How to Verify Teachfloor Webhook Signatures

## How Does Teachfloor Sign Webhooks?

| Item | Value |
|------|-------|
| Header | `teachfloor-signature` |
| Algorithm | HMAC-SHA256 |
| Signed content | The raw request body only (no timestamp, no event ID, no other header) |
| Key | The endpoint's signing secret, used as a UTF-8 string |
| Encoding | Bare lowercase hex (64 characters), no prefix |

Teachfloor's docs compute `hash_hmac('sha256', json_payload, secret)` and compare the result
directly with the header value. Use the raw body, not parsed JSON.

## Implementation

Teachfloor has no webhook SDK, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyTeachfloorSignature(rawBody, signature, secret = process.env.TEACHFLOOR_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string') return false;
  // Exactly 64 hex chars first: Buffer.from(x, 'hex') silently truncates invalid input.
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
```

### Python

```python
import hashlib, hmac

def verify_teachfloor_signature(raw_body: bytes, signature, secret: str) -> bool:
    if not secret or not isinstance(signature, str):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes: compare_digest raises TypeError on non-ASCII str, which would be a 500.
    return hmac.compare_digest(expected.encode("utf-8"), signature.lower().encode("utf-8"))
```

## Common Gotchas

- **Use the raw body.** In Express read it with `express.raw({ type: '*/*' })` so any content
  type is verified, not only `application/json`. In Next.js use `request.arrayBuffer()`; in
  FastAPI `await request.body()`. Never re-serialize parsed JSON.
- **Signing secret is a plain string.** Don't hex- or base64-decode it before keying the HMAC.
- **Compare the whole header value.** There is no prefix, list or `key=value` format to parse.
- **Hex is case-insensitive.** Accept upper- or lowercase, but require exactly 64 hex characters.
- **Each endpoint has its own secret.** Development and production endpoints differ.
- **No timestamp.** Signatures never expire, so deduplicate on the event `id` rather than
  relying on a freshness window. Don't invent one from unsigned fields.
- **Reject when no secret is configured.** An empty key would make the HMAC trivially forgeable.
- **Treat the parsed body as untrusted.** A valid signature proves who sent it, so still check
  that `data` and nested fields have the expected types before reading into them.

## How Do I Debug Verification Failures?

1. Does `TEACHFLOOR_WEBHOOK_SECRET` match **Reveal Signing Secret** on that exact endpoint?
2. Is something between Teachfloor and your code re-encoding the body (a JSON body parser, a
   proxy that reformats)? Log `rawBody.length` and the first bytes.
3. Is the header exactly 64 hex characters? Anything else is rejected before the HMAC is computed.
4. Compute the HMAC locally: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET"`.
