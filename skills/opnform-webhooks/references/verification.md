# How to Verify OpnForm Webhook Signatures

## How Does OpnForm Sign Webhooks?

When a webhook secret is set, every request carries:

```
X-Webhook-Signature: sha256=HEXADECIMAL_VALUE
```

```
signature = HMAC-SHA256(webhook_secret, request_body)
```

`request_body` is the raw JSON payload, and `webhook_secret` is the secret set on the integration. The digest is lowercase hex, and the header value is `sha256=` followed by it. Nothing else is signed: no timestamp, id or header.

Hookdeck's OpnForm source verifies the same way (HMAC, `sha256`, header `x-webhook-signature`, hex), and accepts the digest with or without the `sha256=` prefix.

## Implementation

OpnForm has no SDK for verifying webhooks, so verification is manual.

### Node.js

```javascript
const crypto = require('crypto');

function verifyOpnform(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;
  let sig = signatureHeader.trim();
  if (sig.startsWith('sha256=')) sig = sig.slice('sha256='.length);
  if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected);
}
```

### Python

```python
import hashlib, hmac, re

def verify_opnform(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False
    sig = signature_header.strip()
    if sig.startswith("sha256="):
        sig = sig[len("sha256="):]
    if not re.fullmatch(r"[0-9a-fA-F]{64}", sig):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig.lower().encode(), expected.encode())
```

## Common Gotchas

- **Raw body.** Sign the exact bytes received. Use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` in Next.js, and `await request.body()` in FastAPI. Never `JSON.parse` and `JSON.stringify` first: key order and whitespace change.
- **No secret, no signature.** Without a webhook secret OpnForm sends no `X-Webhook-Signature`, and verification fails. Set one on the integration.
- **Secret is used as typed.** UTF-8 bytes, not hex- or base64-decoded.
- **Validate before decoding.** `Buffer.from(sig, 'hex')` drops invalid characters without an error, so check for exactly 64 hex characters first. Hex is case-insensitive.
- **Constant-time compare.** `crypto.timingSafeEqual` on equal-length buffers, `hmac.compare_digest` on bytes.
- **No replay window.** No timestamp is signed, so don't invent one. Deduplicate on `submission_id`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| No `X-Webhook-Signature` header | The integration has no webhook secret |
| Signature never matches | Body was parsed or re-encoded before hashing, a proxy changed the body, or the secret differs (check trailing whitespace) |
| Matches with `sha256=` stripped but not otherwise | You compared the whole header against the bare digest |
