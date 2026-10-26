# How to Verify Mews POS Webhook Signatures

## How It Works

Mews adds `X-Signature` to every POS API webhook. Per the docs: compute an HMAC SHA-256 hash with your secret key and the raw request body, then encode the result in Base64 (Ruby's `Base64.strict_encode64`, so standard alphabet with `=` padding).

- Header: `X-Signature: <base64>`, bare value with no prefix
- Algorithm: HMAC-SHA256
- Signed content: the raw body bytes only (no timestamp, id or other header)
- Key: the secret's UTF-8 bytes, used as-is
- Encoding: standard Base64, padded: 44 characters matching `[A-Za-z0-9+/]{43}=`

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyMewsPosSignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string') return false;
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false; // validate before comparing
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

`rawBody` must be a `Buffer` (Express: `express.raw({ type: '*/*' })`; Next.js: `Buffer.from(await request.arrayBuffer())`). Never call `Buffer.from(signature, 'base64')` on an unvalidated value: it silently drops bad characters.

### Python

```python
def verify_mews_pos_signature(raw_body: bytes, signature, secret: str) -> bool:
    if not secret or not isinstance(signature, str) or not re.fullmatch(r"[A-Za-z0-9+/]{43}=", signature):
        return False
    expected = base64.b64encode(hmac.new(secret.encode(), raw_body, hashlib.sha256).digest())
    return hmac.compare_digest(signature.encode("ascii"), expected)
```

Use `await request.body()` in FastAPI and compare bytes with `hmac.compare_digest` (never `str`).

## Common Gotchas

- **Raw body**: parsing and re-serialising JSON changes the bytes and breaks the signature. Verify first, parse second.
- **Compare the string, not just the decoded bytes**: a digest whose last Base64 character has stray low bits decodes to the same 32 bytes but is not canonical. Comparing the padded string rejects it, which matches Hookdeck's source.
- **No timestamp**: nothing signed is time-based, so there is no tolerance window. Don't invent one from unsigned headers or body fields (`updatedAt` is not signed).
- **Secret is not decoded**: use the secret's UTF-8 bytes directly.
- **Whole header value**: don't split on commas or strip prefixes.
- **Failures return 401**: missing, empty, malformed or mismatching signature.

## Debugging Verification Failures

1. Log the byte length of the raw body and compare with the `Content-Length` header; a mismatch means middleware altered it.
2. Confirm `MEWS_POS_WEBHOOK_SECRET` is the exact secret with no trailing newline or whitespace.
3. Check the header is exactly 44 characters ending in `=`.
4. Recompute with the Ruby snippet from the docs on the same bytes to compare:
   `Base64.strict_encode64(OpenSSL::HMAC.digest('sha256', secret, payload))`.
