# TriNet Zenefits Signature Verification

## How It Works

Every webhook carries an HTTP header named `signature`. Its value is the lowercase hex HMAC-SHA256 of the raw request body, keyed with your application's webhook shared secret. There is no timestamp, no prefix, and no SDK.

Docs example (Python): `hmac.new(secret, payload, hashlib.sha256).hexdigest()` with secret `lDVtBQnoRcqYv4fUeVD0oyzgsKWHGtqhatjBX5wXRFQzkVUCzBA571E4qUxvR5LE` and payload `{"test":"valid payload"}` gives `219a08ea32f319931dc849badc076323f40367aad859ddba4de82e33135fad31`. The docs say to treat the webhook as unauthorized if the header does not match.

## Implementation

### Manual Verification (Node)

```javascript
const crypto = require('crypto');

function verifyZenefitsSignature(rawBody, signatureHeader, secret) {
  if (typeof signatureHeader !== 'string' || !secret) return false;
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), expected);
}
```

### Manual Verification (Python)

```python
import hashlib, hmac

def verify_zenefits_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.lower().encode(), expected.encode())
```

## Common Gotchas

- **Wrong secret.** Use the app's webhook shared secret, not the OAuth client secret.
- **Raw body.** Verify against the exact bytes received. In Express use `express.raw({ type: '*/*' })` so the body is a Buffer for any content type; do not run `express.json()` first.
- **Invalid hex truncates.** `Buffer.from(x, 'hex')` stops at the first non-hex character, so check `/^[0-9a-f]{64}$/i` before decoding. Otherwise a malformed header can decode to a short buffer and `timingSafeEqual` throws.
- **Non-ASCII headers in Python.** `hmac.compare_digest` raises `TypeError` on non-ASCII `str` inputs; encode both sides to bytes so the result is a 401, not a 500.
- **Header name.** It is literally `signature` (not `X-Signature` or `X-Zenefits-Signature`). Node and FastAPI expose it lowercase.
- **No timestamp.** There is nothing to check for replay, and retries re-deliver the same body. Make handlers idempotent.

## Debugging Verification Failures

1. Confirm you are using the webhook shared secret, not the OAuth client secret.
2. Reproduce the docs example above; if it passes, the algorithm is right and the secret or body is wrong.
3. Log the body length and compare with the byte count of the original request; a mismatch means middleware changed the body.
4. Check the received header is exactly 64 hex characters with no whitespace.
