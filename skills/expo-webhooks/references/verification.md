# How to Verify Expo (EAS) Webhook Signatures

## How Does Expo Sign Webhooks?

EAS computes an **HMAC-SHA1** of the **raw request body**, keyed with the secret you gave `eas webhook:create`, and sends it hex-encoded in the `expo-signature` header with a `sha1=` prefix:

```
expo-signature: sha1=<40 hex characters>
```

There is no timestamp, no message ID, and no SDK. Verification is manual.

## Manual Verification

### Node.js

```javascript
const crypto = require('crypto');

function verifyExpoSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = 'sha1=' + crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import hashlib, hmac

def verify_expo_signature(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    if not signature or not secret:
        return False
    expected = "sha1=" + hmac.new(secret.encode(), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(signature, expected)
```

## Common Gotchas

- **Use the raw body.** In Express use `express.raw({ type: '*/*' })`; Expo's own docs sample uses `bodyParser.text({ type: '*/*' })`. Either way, don't verify against re-serialized JSON.
- **Keep the `sha1=` prefix** when comparing, or strip it from the header before comparing digests.
- **The secret is the one you set**, not an API token. It must be at least 16 characters.
- **Compare in constant time.** `timingSafeEqual` throws on unequal lengths, so catch it.
- **No replay protection.** The signature has no timestamp. Deduplicate on `id` plus `status`.
- **Invalid signatures return 400** in these examples. EAS treats anything outside 200-399 as a failure and retries, which is harmless for a bad signature.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Always fails | Body parsed as JSON before verifying, or a middleware changed the bytes |
| Always fails | Secret differs from the one set with `eas webhook:create` / `webhook:update` |
| Header missing | Request did not come from EAS, or a proxy stripped it |
| Works for some content types only | Body parser limited to `application/json`; use `type: '*/*'` |

Reproduce a signature by hand:

```bash
printf '%s' "$BODY" | openssl dgst -sha1 -hmac "$EXPO_WEBHOOK_SECRET"
```
