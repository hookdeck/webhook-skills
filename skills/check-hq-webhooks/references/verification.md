# How to Verify Check Webhook Signatures

## How It Works

Check puts a **base-16 (hex)** encoded HMAC-SHA-256 of the **raw request body** in the `Check-Signature` header. The HMAC key is the Webhook Config's `key`. There is no timestamp or ID in the signed content, so replay protection comes from `Check-WebhookEvent-ID` (store IDs you've processed).

Check has no official verification SDK, so implement it manually.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyCheckWebhook(rawBody, signatureHeader, key) {
  if (!signatureHeader || !key) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader.trim().toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hmac, hashlib

def verify_check_webhook(raw_body: bytes, signature_header: str, key: str) -> bool:
    expected = hmac.new(key.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode(), (signature_header or "").strip().lower().encode())
```

## Common Gotchas

- **The key is UTF-8 text.** It is 40 hex characters, but do not hex-decode it before using it as the HMAC key.
- **Hex, not base64.** Check's docs call this out: examples for other providers (including generic Hookdeck guides) use base64 and will not match.
- **Raw body.** Verify before parsing JSON. In Express use `express.raw({ type: '*/*' })` so any content type is captured as bytes. In Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Length check first.** `crypto.timingSafeEqual` throws if buffers differ in length.
- **Verify `Check-Signature`**, not the deprecated `X-...` duplicates.
- **Sandbox and live keys differ.** A sandbox key will fail on live traffic and vice versa.
- **Ping has a different body.** `{"message": "Test webhook"}`, no `event` or `data`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong key (sandbox vs live), or the key was hex-decoded |
| Fails only with some frameworks | Body parsed and re-serialized before verifying |
| Computed value looks like `abc+/=` | Used base64 instead of hex |
| Intermittent failures after a proxy change | Proxy altered the body bytes |
| Config stops receiving events | Deactivated after 7 days without a 2XX; reactivate with `PATCH /webhook_configs/{id}` |
