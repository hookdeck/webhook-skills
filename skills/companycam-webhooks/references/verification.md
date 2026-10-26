# How to Verify CompanyCam Webhook Signatures

## How It Works

CompanyCam sends `X-CompanyCam-Signature: Base64(HMAC-SHA1(webhook token, raw body))`. The
key is the `token` supplied when the webhook was created. There is no timestamp in the signed
content and no official verification SDK.

- Algorithm: HMAC-SHA1 (not SHA-256)
- Encoding: base64 (not hex)
- Signed content: the raw request body only

## Implementation

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyCompanyCamSignature(rawBody, signature, token) {
  if (!signature || !token) return false;
  const expected = crypto.createHmac('sha1', token).update(rawBody).digest('base64');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
```

### Python (FastAPI)

```python
import base64, hashlib, hmac

def verify_companycam_signature(raw_body: bytes, signature: str, token: str) -> bool:
    if not signature or not token:
        return False
    digest = hmac.new(token.encode("utf-8"), raw_body, hashlib.sha1).digest()
    expected = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(signature.encode("utf-8"), expected.encode("utf-8"))
```

## Common Gotchas

- **Raw body:** verify against the raw bytes, not a re-serialized parse. In Express use
  `express.raw({ type: '*/*' })` so any content type verifies.
- **No token, no signature:** the token is optional when creating the webhook. Without one,
  deliveries are unsigned and verification fails.
- **SHA-1 and base64:** using SHA-256 or hex comparison will never match.
- **Compare bytes in constant time:** compare the base64 strings as equal-length UTF-8
  buffers (check length first); don't base64-decode the header leniently. In Python compare
  bytes so a non-ASCII header yields 401, not a 500.
- **Respond exactly `200`** on success; other codes trigger retries.
- **Event name field:** the event is `event_type`, not `event` or `type`.

## Debugging Verification Failures

1. Confirm the webhook was created with a `token` and that your env var is the same value.
2. Log the length of the raw body and make sure no middleware parsed or modified it.
3. Recompute with `openssl dgst -sha1 -hmac "$TOKEN" -binary < body.json | base64` and compare.
4. Use the deliveries endpoint (`GET /public_api/v1/webhooks/{webhook_id}/deliveries/{id}`)
   to see the exact request body CompanyCam sent.
