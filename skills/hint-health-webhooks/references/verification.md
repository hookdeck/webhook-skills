# How to Verify Hint Health Webhook Signatures

## How It Works

Every webhook carries `X-Hint-Signature: sha256=<digest>`. The digest is the lowercase hex HMAC-SHA256 of the raw request body, keyed with your webhooks signature key. Only the body is signed: there is no timestamp or id in the signed content, so there is no replay window to check. There is no verification SDK.

Hint's Rails sample splits the header on `=` and uses the prefix as the digest name; its Django sample compares the whole prefixed string. These examples strip a leading `sha256=` and also accept the bare digest.

## Implementation

### Manual Verification (Node)

```javascript
const crypto = require('crypto');

function verifyHintSignature(rawBody, header, secret) {
  if (typeof header !== 'string' || !secret) return false;
  const digest = header.startsWith('sha256=') ? header.slice(7) : header;
  if (!/^[0-9a-f]{64}$/i.test(digest)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), expected);
}
```

### Manual Verification (Python)

```python
import hashlib, hmac, re

def verify_hint_signature(raw_body: bytes, header: str | None, secret: str | None) -> bool:
    if not header or not secret:
        return False
    digest = header.removeprefix("sha256=")
    if not re.fullmatch(r"[0-9a-f]{64}", digest, re.IGNORECASE | re.ASCII):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest.lower().encode("ascii"), expected.encode("ascii"))
```

## Common Gotchas

- **Raw body.** Verify the exact bytes received. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.arrayBuffer()`; in FastAPI use `await request.body()`. Never parse and re-serialize JSON before verifying.
- **Secret is used as-is.** The key is the API key's UTF-8 bytes. Do not hex- or base64-decode it.
- **Wrong environment key.** Live and sandbox have separate keys.
- **Rotation is immediate.** There is no overlap period where the old key still works.
- **Prefix.** The header is `sha256=<hex>`. Strip the prefix before decoding, and accept the bare digest too.
- **Case.** Hex is compared case-insensitively. Require exactly 64 hex characters, then lowercase both sides.
- **Invalid hex truncates.** `Buffer.from(x, 'hex')` drops bad characters, so check the format before decoding. `crypto.timingSafeEqual` throws on unequal lengths.
- **Python str comparison.** `hmac.compare_digest` raises on non-ASCII `str`; compare bytes.
- **No timestamp.** Do not invent a replay window from unsigned headers or body fields. Make handlers idempotent with the envelope `id`.

## Debugging Verification Failures

1. Confirm you are using the webhooks signature key for the right environment (live vs sandbox).
2. Check the received header starts with `sha256=` followed by exactly 64 hex characters.
3. Log the body length and compare with the original request; a mismatch means middleware changed the body.
4. Check for a recent key rotation or a different partner API key being selected as the signature key.
