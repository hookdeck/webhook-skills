# Kontent.ai Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Header | `X-Kontent-ai-Signature` |
| Algorithm | HMAC-SHA256, base64 (44 characters), no prefix |
| Key | The webhook's Secret, as text |
| Signed content | The raw request body |
| Timestamp | None |

## Node.js

```javascript
const crypto = require('crypto');

function verifyKontentAiSignature(rawBody, signature, secret) {
  const value = String(signature || '').trim();
  if (!secret || !/^[A-Za-z0-9+/]{43}=$/.test(value)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'base64'), expected);
}
```

## Python

```python
import base64, hashlib, hmac, re

def verify_kontent_ai_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    value = (signature or "").strip()
    if not secret or not re.fullmatch(r"[A-Za-z0-9+/]{43}=", value):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64decode(value), expected)
```

## Line Endings and the Official Helpers

`@kontent-ai/webhook-helper` (JavaScript) runs `payload.replace(/[\r\n]+/gm, "\r\n")` before hashing. The helper's own test fixture explains why: it is a pretty-printed body that Kontent.ai signed with CRLF line endings, pasted back with LF endings, and it only verifies once LF is turned back into CRLF. The rewrite repairs a modified body. It doesn't mean Kontent.ai signs something other than the bytes it sends. Kontent.ai's .NET helper hashes the raw body with no rewrite.

So: hash the raw bytes as received, and keep any proxy, logger or framework from rewriting line endings first.

## The Legacy Header

Webhooks created before the rename send `X-KC-Signature`. These examples and the Hookdeck source type check only `X-Kontent-ai-Signature`. If you still have an old webhook, recreate it.

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| Every request fails | The Secret was base64-decoded. Use it as text |
| Every request fails | The body was parsed and re-serialised. HMAC the raw bytes |
| Fails only for replayed or copied payloads | Line endings changed from CRLF to LF along the way |
| No `X-Kontent-ai-Signature` header | A legacy webhook that sends `X-KC-Signature` |
| Fails after copying a webhook | Each webhook has its own Secret |
