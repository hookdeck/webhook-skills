# How to Verify Delivereasy Webhook Signatures

> Only Lastmile webhooks are supported: paste your Delivereasy API key. Marketplace webhooks (X-Delivereasy-Signature) aren't covered.

## How It Works

```
X-Signature = base64( HMAC-SHA256( key = API key (UTF-8), message = raw request body ) )
```

Delivereasy's reference: `hmac = OpenSSL::HMAC.digest("sha256", api_key, request_body)`,
`signature = Base64.strict_encode64(hmac)`. Strict base64 means padded standard base64: 44
characters ending in a single `=`. The header holds the digest alone, with no prefix. No timestamp,
id or other header is signed.

## Node.js

```javascript
const crypto = require('crypto');

function verifyDelivereasy(rawBody, signature, apiKey) {
  if (!apiKey || typeof signature !== 'string') return false;
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', apiKey).update(rawBody).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

## Python

```python
import base64, hashlib, hmac, re

def verify_delivereasy(raw_body: bytes, signature, api_key: str) -> bool:
    if not api_key or not signature or not re.fullmatch(r"[A-Za-z0-9+/]{43}=", signature):
        return False
    digest = hmac.new(api_key.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest)
    return hmac.compare_digest(expected, signature.encode("ascii"))
```

## Common Gotchas

- **Raw bytes only.** Never decode and re-encode the body, and never `JSON.parse`/`JSON.stringify`
  before verifying. Express: `express.raw({ type: '*/*' })`; Next.js: `await request.arrayBuffer()`;
  FastAPI: `await request.body()`.
- **The key is used as-is.** Don't hex- or base64-decode the API key.
- **Compare exactly.** Base64 is case-sensitive. A last character with stray low bits decodes to the
  same bytes, so compare the re-encoded string (as the examples do), not just decoded bytes.
- **Don't trust lenient decoders.** `Buffer.from(sig, 'base64')` silently drops bad characters.
- **No replay window.** Nothing signed carries a time, so don't derive one from unsigned fields.
- **Marketplace webhooks differ** (`X-Delivereasy-Signature`, hex, separate secret) and aren't covered.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always 401 | Wrong key (staging vs production), or a body parser ran before verification |
| 401 only for some bodies | The body was re-serialized or re-encoded before hashing |
| Header present but rejected | Value isn't 44-char padded base64, or you're reading `X-Delivereasy-Signature` |
