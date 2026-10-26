# How to Verify Belco Webhook Signatures

## How It Works

- Header: `x-hook-signature`, the bare lowercase hex digest, **no prefix**
- Algorithm: HMAC-SHA256, hex encoded
- Signed content: the **raw request body bytes** only. No timestamp, id or other header is signed
- Key: the webhook's `secret` string, used as its UTF-8 bytes (not hex- or base64-decoded)
- Not the Standard Webhooks spec
- Compare the whole header value as one digest; hex is case-insensitive

## Implementation

Belco has no official verification SDK; verify manually.

Node:

```javascript
const crypto = require('crypto');

function verifyBelcoSignature(rawBody, signatureHeader, secret) {
  if (typeof signatureHeader !== 'string' || !/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  const received = Buffer.from(signatureHeader.toLowerCase());
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

Python:

```python
import hashlib, hmac, re

def verify_belco_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    if not signature_header or not re.fullmatch(r"[0-9a-fA-F]{64}", signature_header, re.ASCII):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest().encode("ascii")
    return hmac.compare_digest(signature_header.lower().encode("ascii"), expected)
```

Respond `401` for a missing, empty, malformed or mismatched signature.

## Common Gotchas

- **Raw body first.** Parsing then re-serializing JSON changes bytes. Pass the exact bytes to the HMAC and parse only after the check. Belco's own sample passes `req.body` as "the raw JSON string"; with Express that means `express.raw({ type: '*/*' })`, not `express.json()`.
- **Bytes, not strings.** Do not decode the body to a string and re-encode it.
- **Validate before decoding.** In Node, `Buffer.from(sig, 'hex')` silently drops invalid characters. Check the exact length (64) and alphabet first, as above.
- **Constant-time compare.** Belco's older sample uses `!==`; use `crypto.timingSafeEqual` or `hmac.compare_digest` instead. In Python compare bytes, since `str` input with non-ASCII characters raises `TypeError`.
- **No replay window.** No timestamp is signed, so don't invent one. Deduplicate on the body's `requestId`.
- **One secret per webhook.** A shop with several webhooks has several secrets.

## Debugging Verification Failures

1. Header missing or empty: the request did not come from Belco, or a proxy stripped it.
2. Mismatch: confirm you are using the `secret` of *this* webhook (from the API response).
3. Mismatch on every request: a JSON body parser consumed the stream; read the raw bytes instead.
4. Proxy or Hookdeck in front: paste the same secret into the Hookdeck source verification settings.
