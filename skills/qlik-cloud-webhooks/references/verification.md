# How to Verify Qlik Cloud Webhook Signatures

## How It Works

When the webhook has a secret, Qlik Cloud sends the `qlik-signature` header:

- Algorithm: HMAC-SHA256
- Signed content: the **raw request body bytes**, and nothing else (no timestamp, id or other header)
- Key: the secret's UTF-8 bytes, used as-is (not hex- or base64-decoded)
- Encoding: lowercase hex, 64 characters, no prefix
- Compare: the whole header value as one digest (no list splitting or prefix parsing)

Qlik's own sample computes the digest over `req.rawBody || Buffer.from(JSON.stringify(req.body))`.
Prefer the first: re-serialising a parsed body doesn't reproduce the original bytes.

## Implementation

Qlik Cloud documents manual HMAC verification and has no webhook verification SDK, so the examples verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyQlikSignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string') return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signature.toLowerCase(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hashlib, hmac, re

def verify_qlik_signature(raw_body: bytes, signature, secret: str) -> bool:
    if not secret or not isinstance(signature, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.lower().encode("ascii"), expected.encode("ascii"))
```

## Common Gotchas

- **Raw bytes.** Use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` or
  `await request.body()`. Never decode to a string and re-encode, and never `JSON.parse` then
  `JSON.stringify` before verifying. `express.json()` before the check breaks it.
- **No secret, no signature.** Without a secret on the webhook Qlik Cloud sends no `qlik-signature`.
  Hookdeck's setup note says it too: "Set a secret on the Qlik Cloud webhook. Without one, deliveries are unsigned and fail verification."
- **Validate before decoding.** Check the header is exactly 64 hex characters first. Node's
  `Buffer.from(sig, 'hex')` silently drops bad characters, so compare the lowercase text instead.
- **Case.** Hex is compared case-insensitively (as Hookdeck does): lowercase both sides.
- **Key is the secret's text.** Don't hex- or base64-decode it. It is 32 to 64 characters.
- **No timestamp, no replay window.** Nothing signed carries a time, so don't invent a tolerance from
  unsigned headers or body fields. Dedupe on the event `id` instead.
- **Every method.** Verify first for GET, POST, PUT, PATCH and DELETE; a missing body is empty bytes.
  A verified empty request is acknowledged with 200, not rejected as invalid JSON.
- **Treat parsed fields as untrusted.** The signature proves the sender, not the shape of the body.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| No `qlik-signature` header | The webhook has no secret (the secret is write-once: edit the webhook and enter a new one) |
| Digest differs, length is 64 | Body was parsed and re-serialised, a proxy changed the bytes, or the secret differs from the one saved |
| Header isn't 64 hex characters | A prefix was added or the header was truncated or altered in transit |
| Works for POST, fails for GET | The body wasn't treated as empty bytes, or the source blocks that method |
| 401 only through Hookdeck | The source's verification secret differs from the one on the Qlik Cloud webhook |
