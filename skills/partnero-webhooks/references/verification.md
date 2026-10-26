# How to Verify Partnero Webhook Signatures

## How It Works

- Header: `Signature` (literally that name), value is the bare hex digest with no prefix
- Algorithm: HMAC-SHA256 of the **raw request body**, keyed with the webhook's signing secret, hex encoded
- No timestamp, no message id; not Standard Webhooks
- Partnero signs the JSON produced by PHP's `json_encode`, which escapes forward slashes (`https:\/\/...`) and non-ASCII characters

## Implementation

Node:

```javascript
const crypto = require('crypto');

function verifyPartneroSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader.toLowerCase()),
    Buffer.from(expected)
  );
}
```

Python:

```python
import hashlib, hmac, re

def verify_partnero_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    if not signature_header or not re.fullmatch(r"[0-9a-fA-F]{64}", signature_header):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.lower().encode("ascii"), expected.encode("ascii"))
```

## Common Gotchas

- **Raw bytes, not parsed JSON.** `JSON.stringify(req.body)` produces different bytes (unescaped slashes), so the signature never matches. In Express use `express.raw({ type: '*/*' })`; in Next.js `await request.arrayBuffer()`; in FastAPI `await request.body()`.
- **Don't decode to a string and re-encode.** Hash the bytes exactly as received.
- **Validate the hex first.** `Buffer.from(x, 'hex')` stops at the first invalid character, so check length and alphabet before decoding or comparing.
- **Compare bytes in Python.** `hmac.compare_digest` on `str` raises `TypeError` for non-ASCII input.
- **Secret is used as-is.** Don't hex- or base64-decode it.
- **No replay window.** Nothing time-based is signed; don't invent a tolerance from unsigned fields. Deduplicate on your own keys instead.

## Debugging Verification Failures

1. Missing header: the request did not come from a Partnero webhook, or a proxy dropped the `Signature` header.
2. Mismatch: confirm the secret is the signing secret of *this* webhook (Program Settings > Webhooks).
3. Mismatch only with certain payloads: a body parser or framework re-serialised the JSON (look for escaped `\/` or `é` in the original).
4. Proxy or Hookdeck in front: paste the same signing secret into the Hookdeck Partnero source verification.
