# How to Verify Katana Webhook Signatures

## How It Works

Each delivery has an `x-sha2-signature` header holding the lowercase hex HMAC-SHA256 of the raw request body,
keyed with the webhook's `token`.

| Item | Value |
|------|-------|
| Header | `x-sha2-signature` (bare hex digest, no prefix) |
| Algorithm | HMAC-SHA256 |
| Signed content | The raw body bytes only (no timestamp, id or header) |
| Key | The webhook `token`, UTF-8 bytes as-is (not hex- or base64-decoded) |
| Encoding | Hex, compared case-insensitively |

Katana has no SDK for this; verify manually. There is no timestamp, so there is no replay window to enforce.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyKatanaSignature(rawBody, signature, secret = process.env.KATANA_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

### Python

```python
import hashlib, hmac, os, re

def verify_katana_signature(raw_body: bytes, signature: str | None, secret: str | None = None) -> bool:
    secret = secret or os.environ.get("KATANA_WEBHOOK_SECRET")
    if not secret or not signature or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode(), signature.lower().encode())
```

## Common Gotchas

- **Use the raw body.** Katana warns that fields may be reordered if you parse the JSON first. Express:
  `express.raw({ type: '*/*' })`; Next.js: `await request.arrayBuffer()`; FastAPI: `await request.body()`.
- **Don't hex-decode the token.** It looks like hex (`73f82127d57a2cea`) but the key is its UTF-8 string.
- **Validate the header format first.** `Buffer.from(sig, 'hex')` silently drops bad characters, so check for
  exactly 64 hex characters before decoding, and check lengths before `timingSafeEqual`.
- **Compare as bytes.** Python's `compare_digest` raises on non-ASCII `str`; encode both sides.
- **One token per webhook.** A delivery is signed with the token of the webhook that sent it.
- **Any HTTP method.** The docs don't name the method. Verify first for every method; a GET with no body is
  signed over zero bytes.
- **No replay protection from the signature.** Deduplicate events in your handler.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always 401 | Wrong token (from another webhook, or hex-decoded), or `KATANA_WEBHOOK_SECRET` unset |
| Fails only on some events | Body parsed and re-serialised before verifying |
| Fails behind a proxy | The proxy altered the body, or stripped `x-sha2-signature` |
| Fails on GET/PUT/DELETE | Route only registered for POST |
