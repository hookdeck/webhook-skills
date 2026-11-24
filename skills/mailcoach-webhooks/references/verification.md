# How to Verify Mailcoach Webhook Signatures

## How It Works

Every request carries `Signature: <hex>`, keyed with the secret Mailcoach generates for the webhook:

1. Take the **raw request body** bytes exactly as received.
2. Compute HMAC-SHA256 keyed with the secret's UTF-8 bytes (used as-is, not hex- or base64-decoded).
3. Hex-encode the digest (lowercase, 64 characters).
4. Compare the whole header value, in constant time, with the digest.

There is no prefix, and no timestamp, id or other header is signed, so the signature does not protect against replays. Do not invent a replay window from unsigned fields; deduplicate on your own key if it matters.

Mailcoach's docs describe the signed content as PHP's default `json_encode($payload)`, with top-level keys sorted before signing, and say it is "not necessarily a signature of the raw HTTP bytes". Their Laravel receiver decodes the body and re-encodes it with `json_encode` before hashing. In PHP you can follow that example. In other languages, hash the raw body as received: re-serialising parsed JSON with another encoder can change escaping, key order or the difference between an empty object and an empty array.

## Implementation

Mailcoach provides no webhook SDK for these frameworks; verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret || !/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader.toLowerCase(), 'utf8'),
    Buffer.from(expected, 'utf8')
  );
}
```

`Buffer.from(x, 'hex')` silently drops invalid characters, so the code validates the shape and compares equal-length ASCII buffers instead. `timingSafeEqual` throws on a length mismatch, which the 64-character check rules out.

### Python

```python
import hmac, hashlib, re

def verify(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not re.fullmatch(r"[0-9a-fA-F]{64}", signature_header):
        return False
    computed = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.lower().encode("ascii"), computed.encode("ascii"))
```

`hmac.compare_digest` on `str` raises `TypeError` for non-ASCII input, which would turn a bad header into a 500. Comparing bytes after the shape check avoids that.

## Common Gotchas

- **Raw body:** Parsing and re-serializing JSON changes bytes and breaks the signature. In Express use `express.raw({ type: '*/*' })` so any content type stays raw; in Next.js use `await request.arrayBuffer()`; in FastAPI use `await request.body()`. Parse only after the check.
- **Header name:** It is literally `Signature` (no `X-` prefix). Names are case-insensitive.
- **No prefix:** The value is the bare digest. Reject `sha256=...` values.
- **Case:** Hex is compared case-insensitively. Require exactly 64 hex characters, then lowercase both sides.
- **Secret encoding:** Use the secret string from the details page as UTF-8 bytes.

## Debugging Verification Failures

- Confirm the secret in your env var (and in Hookdeck) matches the one on the Mailcoach webhook's details page exactly, with no stray whitespace.
- Make sure nothing (a proxy, a body parser, a middleware) rewrites the body before verification.
- Check **Webhook logs** on the webhook's details page for what Mailcoach sent and how your endpoint answered.
- Test with a known signed fixture, a wrong secret and a modified payload before you enable processing, as Mailcoach's docs suggest.
