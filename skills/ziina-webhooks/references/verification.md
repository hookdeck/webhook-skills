# Ziina Signature Verification

## How Does Ziina Sign Webhooks?

If a `secret` was provided when the webhook was registered, each request carries:

```
X-Hmac-Signature: <64 lowercase hex characters>
```

The value is the hex-encoded HMAC-SHA256 of the **raw request body**, keyed with the secret's UTF-8 bytes. Nothing else is signed: no timestamp, id or other header. There is no prefix (`sha256=` etc.) and no list of signatures, so compare the whole header value as one digest. This is not Standard Webhooks.

Because no timestamp is signed, there is no replay window to check. Do not invent one from unsigned headers or body fields; make handlers idempotent instead.

## Verification Steps

1. Read the raw body bytes (never a parsed and re-serialised body).
2. Check the header exists and is exactly 64 hex characters.
3. Compute HMAC-SHA256 over the bytes, key = secret as UTF-8 bytes, digest as bytes.
4. Compare in constant time, with equal-length buffers.
5. Respond `401` on a missing, malformed or mismatching signature; parse JSON only after it passes.

### Node.js

```javascript
const crypto = require('crypto');

function verifyZiinaWebhook(rawBody, signatureHeader, secret) {
  if (!secret || typeof signatureHeader !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signatureHeader)) {
    return false;
  }
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader, 'hex'); // safe: format already validated
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

Express: `express.raw({ type: '*/*' })`. Next.js: `await request.arrayBuffer()`.

### Python

```python
import hashlib, hmac, re

def verify_ziina_webhook(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    if not secret or not signature_header or not re.fullmatch(r"[0-9a-fA-F]{64}", signature_header):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature_header), expected)
```

FastAPI: `await request.body()`.

## Common Gotchas

- **Unsigned deliveries**: with no secret set at registration, there is no `X-Hmac-Signature` header and verification fails. Set a secret when you register the webhook through the Ziina API. Without one, deliveries are unsigned and fail verification.
- **Raw body only**: re-serialising JSON changes bytes and breaks the signature.
- **Hex case**: compare case-insensitively by decoding to bytes (Hookdeck does the same).
- **Secret overwrite**: calling `POST /webhook` again replaces the secret; update your env var at the same time.
- **Don't decode the secret**: it is used as plain UTF-8 bytes.

## Debugging Verification Failures

- Header missing: the webhook was registered without a `secret`.
- Header present but mismatch: confirm the env var equals the secret last sent to `POST /webhook`, and that no proxy or middleware re-encodes the body.
