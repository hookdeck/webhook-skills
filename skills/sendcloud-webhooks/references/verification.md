# How to Verify Sendcloud Webhook Signatures

## How Does Sendcloud Sign Webhooks?

Sendcloud computes HMAC-SHA256 over the entire raw request body using the integration Secret Key or Webhook Signature Key (UTF-8) and sends the lowercase hex digest in the `Sendcloud-Signature` header. There is no timestamp in the signed content and no prefix on the value.

Docs test vector: body `{"key": "value"}`, secret `secretkey` → `1eed4b3d41f4653ac64fd56f1bf1cbfd349e4482cbc11dff7134bd93e5da4b0a`.

## Implementation

Sendcloud publishes no webhook SDK, so verification is manual.

### Node.js

```javascript
const crypto = require('crypto');

function verifySendcloudSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hashlib, hmac

def verify_sendcloud_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode(), signature.encode())
```

## Common Gotchas

- **Raw body**: hash the bytes exactly as received. Re-serialised JSON (note the space in `{"key": "value"}`) breaks the signature.
- **Content type**: in Express use `express.raw({ type: '*/*' })` so any content type reaches the verifier as a Buffer.
- **Which secret**: Secret Key or Webhook Signature Key depending on integration type.
- **Case/format**: the header is bare hex; compare in constant time.
- **No replay protection**: the signature has no timestamp. Dedupe and order using the payload `timestamp`.

## Debugging Verification Failures

1. Check the secret matches the integration that sends the webhook.
2. Log the raw body length and confirm no middleware parsed it first.
3. Run the test vector above against your function.
4. Use **Test API webhook** in the integration settings to send a fresh request.
