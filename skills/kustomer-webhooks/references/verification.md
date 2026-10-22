# Kustomer Signature Verification

## How Does Kustomer Sign Webhooks?

- Header: `X-Kustomer-Webhook-Signature`
- Algorithm: HMAC-SHA256
- Signed content: the raw request body (no timestamp, no id prefix)
- Key: the outbound webhook's `token` (shown in the UI after the first save)
- Encoding: lowercase hex, with no `sha256=` prefix

Kustomer has no official webhook verification SDK, so use the manual implementation.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyKustomerSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import hmac, hashlib

def verify_kustomer_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.encode(), expected.encode())
```

## Common Gotchas

- **Raw body**: hash the bytes exactly as received. In Express use `express.raw({ type: '*/*' })` so any content type is left unparsed; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **No timestamp**: the signature does not cover a timestamp, so there is no built-in replay window. Deduplicate on the payload `id`.
- **Hex, not base64**: don't decode the header; compare hex strings.
- **Secret exists only after first save**: a new webhook has no secret until you save it and reopen it.
- **Secret per webhook**: each outbound webhook has its own token.
- **Length mismatch**: `crypto.timingSafeEqual` throws on unequal lengths; catch it and return false.

## Debugging Verification Failures

- Log the length of the raw body and compare with Kustomer's logs; a parsed-then-re-serialized body won't match.
- Check proxies or middleware that decompress, re-encode or trim the body.
- Confirm you copied the `token`, not a Kustomer API key.
- Confirm you're using the secret of the webhook that sent the request.
- Check that the header isn't absent: requests without it should be rejected with 400.
