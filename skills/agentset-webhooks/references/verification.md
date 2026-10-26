# How to Verify Agentset Webhook Signatures

## How Does Agentset Sign Webhooks?

"All webhooks are delivered with an `Agentset-Signature` header." The value is the lowercase hex
HMAC-SHA256 of the raw request body, keyed with the webhook's signing secret:

```javascript
crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
```

| Item | Value |
|------|-------|
| Header | `agentset-signature` (case-insensitive) |
| Algorithm | HMAC-SHA256 |
| Signed content | The raw body bytes only (no timestamp, id or header) |
| Key | Signing secret as UTF-8 bytes, as-is |
| Encoding | Bare hex, 64 characters, no prefix. Compared case-insensitively |

Because no timestamp is signed there is no replay window to enforce. Don't invent one from unsigned
headers or body fields; dedupe on the envelope `id` instead.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');
const HEX64 = /^[0-9a-fA-F]{64}$/;

function verifyAgentsetSignature(rawBody, signature, secret = process.env.AGENTSET_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string' || !HEX64.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

### Python

```python
import hashlib, hmac, os, re
from typing import Optional

def verify_agentset_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str] = None) -> bool:
    secret = secret or os.environ.get("AGENTSET_WEBHOOK_SECRET")
    if not secret or not signature or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature), expected)  # bytes, never str
```

## Common Gotchas

- **Use the raw bytes.** Parsing and re-serializing JSON changes whitespace and key order and breaks
  the match. Express: `express.raw({ type: '*/*' })`. Next.js: `await request.arrayBuffer()`.
  FastAPI: `await request.body()`.
- **No prefix, no list.** Compare the whole header value as one digest; don't strip `sha256=` or split.
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops bad characters, so check for
  exactly 64 hex characters first. Compare in constant time on equal-length bytes.
- **The key is the secret string.** Don't hex- or base64-decode it.
- **Any HTTP method.** The docs don't name one, so verify GET/POST/PUT/PATCH/DELETE alike. A request
  with no body is verified over zero bytes; once verified, acknowledge it with 200.
- **Wrong-typed fields.** After verifying, check the type of the body and each nested field before
  reading into it, so odd payloads give a 400 or are ignored, never a 500.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always 401 | Wrong secret (each webhook has its own), or body parsed before verifying |
| 401 only behind a proxy | Something re-encodes or compresses the body; verify the bytes as received |
| 401, header present | Header isn't 64 hex characters (a prefix, quotes, or a truncated copy) |
| 401 on GET | The sender signs an empty body; read the body as empty bytes, don't reject it |
| 401 with `AGENTSET_WEBHOOK_SECRET` unset | The examples reject everything when unconfigured |
