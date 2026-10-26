# How to Verify Logto Webhook Signatures

## How It Works

Logto signs every webhook request and sends the result in:

- Header: `logto-signature-sha-256`
- Algorithm: HMAC-SHA256, keyed with the webhook's signing key (UTF-8 bytes, not hex- or base64-decoded)
- Encoding: lowercase **hex**, bare value (no `sha256=` prefix)
- Signed content: the **raw request body bytes** only. No timestamp, ID or other header is signed.

Because nothing time-based is signed, there is no tolerance window to check. Don't invent one from unsigned headers or body fields such as `createdAt`; use idempotency to cope with repeats.

## Implementation

Logto has no webhook verification SDK; its docs show a manual `createHmac` example. Verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyLogtoSignature(rawBody, signatureHeader, secret) {
  if (!Buffer.isBuffer(rawBody) || !signatureHeader || !secret) return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader.toLowerCase(), 'hex');
  return crypto.timingSafeEqual(received, expected);
}
```

### Python

```python
import hashlib, hmac, re

HEX64 = re.compile(r"[0-9a-fA-F]{64}")

def verify_logto_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret or not HEX64.fullmatch(signature_header):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature_header), expected)
```

## Common Gotchas

- **Use the raw body.** Logto's docs say to avoid the parsed body. In Express use `express.raw({ type: '*/*' })` so any content type is verified as bytes; in Next.js use `await request.arrayBuffer()`; in FastAPI use `await request.body()`. Parse JSON only after the check passes.
- **Don't decode the body to a string and back.** Keep the bytes you received.
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops invalid characters, so check for exactly 64 hex characters first. Then compare equal-length byte buffers with `crypto.timingSafeEqual` / `hmac.compare_digest`. Comparing hex is case-insensitive, so lowercase (or decode) both sides.
- **The whole header is one digest.** No `sha256=` prefix, no list of signatures, no `t=`/`v1=` pairs.
- **The sample in Logto's docs uses `===`.** Use a constant-time comparison instead.
- **The signing key is per webhook.** If you have several webhooks pointing at one endpoint, each has its own key.
- **Respond with 401 on a bad or missing signature** and don't process the body.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Header missing | Request didn't come from Logto, or a proxy stripped it |
| Always invalid | Wrong signing key (copy it again from the webhook details page; make sure it's the right webhook) |
| Invalid for every request after adding middleware | A body parser (`express.json()`) ran first and the raw bytes were lost |
| Invalid only on some requests | Middleware re-serializing JSON, or a gateway altering whitespace or decompressing the body |
| Works with test payloads but not real ones | Different webhook (and signing key) for the real traffic |
