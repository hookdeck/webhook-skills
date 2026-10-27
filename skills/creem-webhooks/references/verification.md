# How to Verify Creem Webhook Signatures

## How Does Creem Sign Webhooks?

| Item | Value |
|------|-------|
| Header | `creem-signature` |
| Algorithm | HMAC-SHA256 |
| Signed content | The raw request body only (no timestamp, no event id, no other header) |
| Key | The endpoint's signing secret, used as a UTF-8 string |
| Encoding | Bare lowercase hex (64 characters), no prefix |

Sample header from Creem's docs:

```
creem-signature: dd7bdd2cf1f6bac6e171c6c508c157b7cd3cc1fd196394277fb59ba0bdd9b87b
```

Compare the whole header value as one digest. There is no list, prefix or `t=` part to parse.

## Implementation

Creem's TypeScript SDK exports `verifyWebhookSignature(rawBody, headers, { secret })` from
`creem/webhooks`, and the `@creem_io/nextjs` adapter has a `Webhook` helper. The examples verify
manually instead, so the same check applies to Express, Next.js and FastAPI.

### Node.js

```javascript
const crypto = require('crypto');

function verifyCreemSignature(rawBody, signature, secret = process.env.CREEM_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string') return false;
  // Exactly 64 hex chars first: Buffer.from(x, 'hex') silently drops invalid characters.
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
```

### Python

```python
import hashlib, hmac

def verify_creem_signature(raw_body: bytes, signature, secret: str) -> bool:
    if not secret or not isinstance(signature, str):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes: compare_digest raises TypeError on a non-ASCII str, which would be a 500.
    return hmac.compare_digest(expected.encode("utf-8"), signature.lower().encode("utf-8"))
```

## Common Gotchas

- **Use the raw body.** In Express read it with `express.raw({ type: '*/*' })` so any content
  type is verified, not only `application/json`. In Next.js use `request.arrayBuffer()`; in
  FastAPI `await request.body()`. Never re-serialize parsed JSON, and parse only after the check.
- **Hex is case-insensitive.** Hookdeck accepts upper- and lowercase digests; so do the examples.
- **The secret is a plain string.** Don't hex- or base64-decode it before keying the HMAC.
- **Test and live endpoints have different secrets.**
- **No timestamp is signed.** There is no replay window to enforce, and you shouldn't invent one
  from unsigned fields. Deduplicate on the event `id` instead.
- **No source IP allowlist.** Creem doesn't publish static IPs; signature verification is the
  authentication.
- **Reject when no secret is configured.** An empty key makes the HMAC trivially forgeable.

## How Do I Debug Verification Failures?

1. Does `CREEM_WEBHOOK_SECRET` match the secret of that exact endpoint (test vs live)?
2. Is something between Creem and your code re-encoding the body (a JSON body parser, a proxy
   that reformats)? Log `rawBody.length` and the first bytes.
3. Is the header 64 hex characters? Anything else is rejected before the HMAC is computed.
4. Compute the HMAC locally: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET"`.
