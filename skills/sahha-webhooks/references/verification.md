# How to Verify Sahha Webhook Signatures

## How Does Sahha Sign Webhooks?

Sahha has no webhook SDK; the scheme is plain HMAC-SHA256.

| Item | Value |
|------|-------|
| Header | `X-Signature` |
| Algorithm | HMAC-SHA256 |
| Signed content | The raw request body bytes only (no timestamp, id or other header) |
| Key | The Dashboard secret key as UTF-8 bytes, used as-is (not hex- or base64-decoded) |
| Encoding | Hex, bare (no prefix); Sahha's samples compare case-insensitively |

Because no timestamp is signed there is no replay window to check. Don't invent one from unsigned headers or body fields; dedupe instead.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody /* Buffer */, signature, secret) {
  if (typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest();
  const provided = Buffer.from(signature, 'hex'); // safe: format validated above
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}
```

### Python

```python
import hashlib, hmac, re
from typing import Optional

def verify(raw_body: bytes, signature: Optional[str], secret: str) -> bool:
    if not signature or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature), expected)  # bytes, never str
```

Return `401` for a missing, empty or malformed header and for a mismatch.

## Common Gotchas

- **Raw body**: use `express.raw({ type: '*/*' })` (Express), `await request.arrayBuffer()` (Next.js) or `await request.body()` (FastAPI). Parsing and re-serialising JSON changes the bytes. Sahha's own Express sample uses `express.text()`, which also preserves the exact string.
- **Validate before decoding**: `Buffer.from(x, 'hex')` silently drops invalid characters, so check for exactly 64 hex characters first.
- **Case**: hex is compared case-insensitively, so decode both sides to bytes (or lowercase both).
- **Whole header value**: don't split on commas or strip prefixes; the header is one bare digest.
- **Secret**: use the Dashboard string exactly as copied. Don't base64- or hex-decode it.
- **Untrusted fields**: after verification, still type-check every field before reading it; senders can add or change fields.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Always `401` | Body parsed before verifying, wrong secret, or secret copied with whitespace |
| `401` only for some events | A proxy or middleware re-encoded the body |
| `401` for non-ASCII payloads | Body was decoded to a string and re-encoded; sign the original bytes |
| `500` on every request | `SAHHA_WEBHOOK_SECRET` not set (the examples fail closed) |
