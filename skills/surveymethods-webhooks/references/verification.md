# How to Verify SurveyMethods Webhook Signatures

## How It Works

- Header: `X-SurveyMethods-Signature`, value `sha256=<hex>`
- Algorithm: HMAC-SHA256 of the **raw request body**, hex encoded (lowercase)
- Key: the webhook's signing secret, as its UTF-8 bytes (not hex- or base64-decoded)
- Only the body is signed: no timestamp, no id header; not Standard Webhooks. There is no replay window to check.
- Accept the value with or without the `sha256=` prefix; compare hex case-insensitively

## Implementation

Node:

```javascript
const crypto = require('crypto');

function verifySurveyMethodsSignature(rawBody, signatureHeader, secret) {
  if (typeof signatureHeader !== 'string' || !secret) return false;
  let received = signatureHeader.trim();
  if (received.startsWith('sha256=')) received = received.slice('sha256='.length);
  if (!/^[0-9a-f]{64}$/i.test(received)) return false; // invalid hex would silently truncate
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}
```

Python:

```python
import hashlib, hmac, re

def verify_surveymethods_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    received = signature_header.strip()
    if received.startswith("sha256="):
        received = received[len("sha256="):]
    if not re.fullmatch(r"[0-9a-fA-F]{64}", received):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(received.lower().encode("utf-8"), expected.encode("utf-8"))
```

## Common Gotchas

- **Raw body first.** Parsing then re-serializing JSON changes bytes. Verify before `JSON.parse`. In Express use `express.raw({ type: '*/*' })`; in Next.js `await request.arrayBuffer()`; in FastAPI `await request.body()`.
- **Bytes, not strings.** Hash the bytes exactly as received; do not decode and re-encode.
- **Secret is used as-is.** Do not hex- or base64-decode it.
- **Validate hex before decoding in Node.** `Buffer.from(x, 'hex')` stops at the first invalid character, so check `/^[0-9a-f]{64}$/i` first.
- **Compare bytes in Python.** `hmac.compare_digest` on `str` raises `TypeError` for non-ASCII input; encode both sides.
- **No timestamp tolerance.** Nothing time-based is signed; do not invent a window from unsigned headers or `eventTime`.
- **Secret per webhook.** Each webhook has its own secret; use the one for the webhook that sent the request.

## Debugging Verification Failures

1. Header missing: the request did not come from a SurveyMethods webhook, or a proxy stripped it.
2. Mismatch: confirm the secret belongs to this webhook and has no stray whitespace or quotes.
3. Mismatch on a correct secret: a body parser consumed or altered the stream; read raw bytes instead.
4. Hookdeck in front: paste the same signing secret into the Hookdeck source verification.
