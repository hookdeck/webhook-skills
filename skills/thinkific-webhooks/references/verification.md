# How to Verify Thinkific Webhook Signatures

## How Does Thinkific Sign Webhooks?

Every request includes an `X-Thinkific-Hmac-Sha256` header: the hex-encoded HMAC-SHA256 of the raw
request body, keyed with a signing secret.

```
X-Thinkific-Hmac-Sha256: <64 lowercase hex characters>
```

- Algorithm: HMAC-SHA256, hex output, no prefix. Compare the whole header value as one digest.
- Signed content: the raw body bytes only. No timestamp, id or other header is signed, so there is
  no replay window to enforce; don't invent one from unsigned fields such as `created_at` or `timestamp`.
- Key: the secret's UTF-8 bytes, used as-is (not hex- or base64-decoded). The secret is the webhook's
  signing secret, the site API key, or the app client secret, depending on how the webhook was created.

Thinkific's own Ruby sample is `OpenSSL::HMAC.hexdigest(OpenSSL::Digest.new('sha256'), secret, request.body.read)`.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');
const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

function verifyThinkificSignature(rawBody, signature, secret = process.env.THINKIFIC_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string' || !HEX_SHA256.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // format validated first
  return crypto.timingSafeEqual(received, expected);
}
```

### Python

```python
import hashlib, hmac, os, re

def verify_thinkific_signature(raw_body: bytes, signature, secret=None) -> bool:
    secret = secret if secret is not None else os.environ.get("THINKIFIC_WEBHOOK_SECRET")
    if not secret or not signature or re.fullmatch(r"[0-9a-fA-F]{64}", signature) is None:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.lower().encode("ascii"), expected.encode("ascii"))
```

## Common Gotchas

- **Use the raw bytes.** Verify the body exactly as received. Re-serialising parsed JSON changes
  spacing, key order or escapes and breaks the signature. Use `express.raw({ type: '*/*' })`,
  `await request.arrayBuffer()` or `await request.body()`.
- **Validate the header before decoding.** `Buffer.from(sig, 'hex')` silently drops bad characters,
  so check for exactly 64 hex characters first, then lowercase both sides (or decode to bytes).
- **Constant-time compare.** Compare equal-length buffers with `crypto.timingSafeEqual`. In Python
  pass **bytes** to `hmac.compare_digest`; a non-ASCII `str` raises `TypeError` and would turn a bad
  header into a 500.
- **Fail closed.** If `THINKIFIC_WEBHOOK_SECRET` is unset, reject every request.
- **Wrong secret.** Old webhooks use the site API key and OAuth app webhooks the app client secret;
  a newer webhook uses its own signing secret.
- **No replay protection.** Nothing but the body is signed. Deduplicate on the event `id`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Wrong secret (signing secret vs API key vs client secret), or the secret was edited with whitespace |
| 401 only after parsing JSON first | The body was re-serialised; verify the raw bytes |
| 401 with a `sha256=` value | You are comparing a prefixed value; Thinkific sends the bare hex digest |
| 401 on some content types | A JSON-only body parser rejected or consumed the body; read it raw for every content type |
| 500 on odd header values | `hmac.compare_digest` was given `str`; encode to bytes first |
