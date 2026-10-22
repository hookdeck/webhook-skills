# How to Verify HeyGen Webhook Signatures

## How It Works

| Item | Value |
|------|-------|
| Header | `signature` (case-insensitive) |
| Algorithm | HMAC-SHA256 |
| Signed content | The raw request body (no timestamp, no id) |
| Encoding | Hex, no prefix |
| Key | The endpoint `secret` (`whsec_...`) used whole as a UTF-8 string |

This is **not** Standard Webhooks. Do not use the `standardwebhooks` or `svix` libraries, and do not strip `whsec_` or base64-decode the secret. HeyGen provides no webhook verification SDK, so verify manually.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyHeyGenSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim().toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hashlib, hmac

def verify_heygen_signature(raw_body: bytes, signature: str | None, secret: str) -> bool:
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip().lower())
```

## Common Gotchas

- **Raw body only.** Re-serialized JSON changes whitespace/key order and breaks the HMAC. Express: `express.raw({ type: '*/*' })`; Next.js: `await request.text()`; FastAPI: `await request.body()`.
- **Whole secret as the key.** Using `whsec_` stripped, or base64-decoded (Svix style), always fails.
- **No timestamp.** There is nothing to check for replay; dedupe retries on `event_data.video_id` + `event_type`.
- **Header name is just `signature`.** Frameworks lowercase header names; look it up case-insensitively.
- **Secret shown once.** If you lost it, rotate it (`POST /v3/webhooks/endpoints/{id}/rotate-secret`).
- **Rotation window.** The old secret stops working immediately; failed verifications during rollover are expected.

## Debugging Verification Failures

1. Log the raw body length and compare with the bytes you receive in a tunnel inspector (Hookdeck CLI web UI).
2. Confirm the secret is the full `whsec_...` string with no quotes or trailing newline from your `.env`.
3. Confirm no middleware parsed the body before verification.
4. Recompute locally: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$HEYGEN_WEBHOOK_SECRET"`.
5. If the endpoint was rotated, update the deployed secret.
