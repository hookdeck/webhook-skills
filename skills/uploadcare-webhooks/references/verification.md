# How to Verify Uploadcare Webhook Signatures

## How It Works

With a `signing_secret` set, Uploadcare adds `X-Uc-Signature: v1=<hex>` to each request, where
`<hex>` is the lowercase hex HMAC-SHA256 of the **raw request body**, keyed with the signing secret
(its UTF-8 bytes, used as-is). Nothing else is signed: no timestamp, no id, no other header.

## Implementation

Uploadcare has no verification helper for these frameworks, so verify manually.

```javascript
const crypto = require('crypto');

function verifyUploadcareSignature(rawBody, header, secret) {
  if (!secret || typeof header !== 'string') return false;
  let sig = header.trim();
  if (sig.toLowerCase().startsWith('v1=')) sig = sig.slice(3);
  sig = sig.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sig)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(sig, 'hex'));
}
```

```python
import hashlib, hmac, re

def verify_uploadcare_signature(raw_body: bytes, header, secret) -> bool:
    if not secret or not header:
        return False
    sig = header.strip()
    if sig.lower().startswith("v1="):
        sig = sig[3:]
    sig = sig.lower()
    if not re.fullmatch(r"[0-9a-f]{64}", sig):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(expected, bytes.fromhex(sig))
```

## Common Gotchas

- **Raw body.** Verify the exact bytes received. Parsing and re-serializing JSON changes them.
  Express: `express.raw({ type: '*/*' })`. Next.js: `await request.arrayBuffer()`. FastAPI: `await request.body()`.
- **No secret, no signature.** If the webhook has no `signing_secret`, there is no header and every
  request fails verification (this handler returns `401`).
- **Prefix.** The header value is `v1=<hex>`; strip the `v1=`. A bare digest is also accepted.
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops bad characters, so check
  length (64) and alphabet first. Python: `compare_digest` on bytes, not `str`.
- **Substring check in Uploadcare's sample.** Their Python snippet does `calculated in header`;
  use an exact, constant-time comparison instead.
- **No replay window.** No timestamp is signed, so don't invent one from unsigned data. Make
  handlers idempotent; retries can redeliver the same event.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| No `X-Uc-Signature` header | No `signing_secret` on the webhook |
| Mismatch with the right secret | Body was parsed/re-serialized, or a middleware changed the bytes |
| Mismatch after editing the secret | Server env var differs from the webhook's `signing_secret` |
| Always 401 locally | `UPLOADCARE_WEBHOOK_SECRET` unset (an unset secret rejects everything) |
