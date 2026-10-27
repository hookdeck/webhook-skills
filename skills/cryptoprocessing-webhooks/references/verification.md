# How to Verify CryptoProcessing Webhook Signatures

## How It Works

Every callback carries:

- `X-Processing-Signature`: the lowercase hex HMAC-SHA512 (128 characters, no prefix) of the raw HTTP body
- `X-Processing-Key`: the Master API key (public part) that signed it

The HMAC key is the secret key of the account's **active Master API key**, used as UTF-8 bytes (not hex- or base64-decoded). Custom API keys never sign callbacks, and activating another Master key changes the secret. The signed content is only the body: no timestamp, id or other header is included, so there is nothing to replay-check from the signature.

CryptoProcessing has no webhook verification SDK, so verification is manual in every framework. The same scheme signs the platform's API requests.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyCryptoProcessingSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  if (!/^[0-9a-fA-F]{128}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase(), 'hex'), expected);
}
```

`rawBody` is a `Buffer` of the exact bytes received. The format check comes first because `Buffer.from(value, 'hex')` silently drops invalid characters.

### Python

```python
import hashlib, hmac, re

def verify_cryptoprocessing_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    if not signature or not secret or not re.fullmatch(r"[0-9a-fA-F]{128}", signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(signature.lower().encode(), expected.encode())
```

### Test vector (from the CryptoProcessing docs)

- Secret: `AbCdEfG123456`
- Body: `{"currency":"BTC","foreign_id":"123456"}`
- `X-Processing-Signature`: `03c25fcf7cd35e7d995e402cd5d51edd72d48e1471e865907967809a0c189ba55b90815f20e2bb10f82c7a9e9d865546fda58989c2ae9e8e2ff7bc29195fa1ec`

The docs write this example for signing API requests, which use the same scheme. Each example's test suite includes it.

## Common Gotchas

- **Use the raw body.** Re-serializing parsed JSON changes whitespace and key order. In Express use `express.raw({ type: '*/*' })`; in Next.js use `request.arrayBuffer()`; in FastAPI use `await request.body()`. Don't gate the parser on `application/json`.
- **Wrong key.** Use the secret of the *active Master* key, not a custom key and not the public key from `X-Processing-Key`. Rotating the Master key changes the secret.
- **Hex case.** Compare hex case-insensitively (lowercase both sides) and require exactly 128 characters. Compare the whole header value as one digest; there is no `sha512=` prefix or list to split.
- **No timestamp.** Nothing signed carries a time, so don't invent a replay window from unsigned fields. De-duplicate on `type`, the id (`id`, or `payment_request_id` for payment requests) and `status`.
- **Status codes.** Return `401` for a missing, malformed or wrong signature. Return `200` once processed; only `200` stops retries, and `201` stops them for a duplicate.

## Debugging Verification Failures

1. Run the docs test vector through your function; if it doesn't produce `03c25fcf…fa1ec`, the bug is in your code.
2. Log the body's byte length and compare with `Content-Length`; a mismatch means a middleware changed the body.
3. Confirm the secret in your env is the active Master key's secret, with no trailing newline or quotes. Check `X-Processing-Key` to see which Master key signed.
4. If it worked before and stopped, someone probably activated a different Master key.
5. Behind a proxy or gateway? Make sure it forwards the body and `X-Processing-Signature` unchanged.
