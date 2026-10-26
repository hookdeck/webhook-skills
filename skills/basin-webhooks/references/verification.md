# How to Verify Basin Webhook Signatures

## How It Works

- Header: `X-Basin-Signature`, value `sha256=<hex>`
- Algorithm: HMAC-SHA256 of the **raw request body**, keyed with the webhook signing secret, hex encoded
- No timestamp, no message id; not Standard Webhooks
- Available on the Growth plan and above only

## Implementation

Node:

```javascript
const crypto = require('crypto');

function verifyBasinSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const received = signatureHeader.slice('sha256='.length);
  if (!/^[0-9a-f]{64}$/i.test(received)) return false; // invalid hex would silently truncate
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}
```

Python:

```python
import hashlib, hmac

def verify_basin_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    received = signature_header[len("sha256="):].lower().encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest().encode("utf-8")
    return hmac.compare_digest(received, expected)
```

## Common Gotchas

- **Raw body first.** Parsing then re-serializing JSON changes bytes. Verify before parsing JSON or form data.
- **Any content type.** The body may be JSON or `application/x-www-form-urlencoded`. In Express use `express.raw({ type: '*/*' })`.
- **Prefix required.** The header includes `sha256=`; strip it before comparing.
- **Validate hex before decoding in Node.** `Buffer.from(x, 'hex')` stops at the first invalid character, so check `/^[0-9a-f]{64}$/i` first.
- **Compare bytes in Python.** `hmac.compare_digest` on `str` raises `TypeError` for non-ASCII input; encode both sides.
- **Unsigned on lower plans.** No header is sent below Growth; that is a plan limit, not a bug in your code.
- **Secret rotation.** After "Regenerate Secret", the old secret stops working immediately.

## Debugging Verification Failures

1. Header missing: the form is on a plan below Growth, or the webhook was saved without signing.
2. Mismatch: confirm the secret is the one shown under Webhook Signing for *this* form's webhook.
3. Mismatch on form-encoded payloads: a body parser consumed the stream; read raw bytes instead.
4. Proxy or Hookdeck in front: paste the same signing secret into the Hookdeck source verification.
