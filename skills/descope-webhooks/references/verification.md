# How to Verify Descope Webhook Signatures

## How It Works

When an **HMAC Secret** is set on the Audit Webhook connector, Descope signs the payload and sends the result in:

- Header: `x-descope-webhook-s256`
- Algorithm: HMAC-SHA256, keyed with your HMAC Secret
- Encoding: **base64** (not hex)
- Signed content: the JSON string Descope sends as the body. Verify against the **raw body bytes**.

No timestamp or message ID is sent, so there's no tolerance window; use idempotency for replays.

## Implementation

Descope has no webhook verification SDK, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyDescopeSignature(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader, 'base64');
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(received, expected);
}
```

### Python

```python
import base64, binascii, hashlib, hmac

def verify_descope_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    try:
        received = base64.b64decode(signature_header, validate=True)
    except (binascii.Error, ValueError):
        return False
    return hmac.compare_digest(received, expected)
```

## Common Gotchas

- **Use the raw body.** Descope's docs show a sample that verifies `JSON.stringify(req.body)` after `bodyParser.json()`, and describe the signature as made "from a JSON string, not the raw post body". That only matches if re-serialization reproduces the bytes exactly. Reading the raw body is more robust, and what these examples do. In Express use `express.raw({ type: '*/*' })` so any content type is verified; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **The body is an array.** Parse it as a JSON array after verifying.
- **The secret is optional.** Without it there is no signature header, and anyone who knows your URL can post events. Set one and reject requests without a valid signature.
- **The sample in the docs compares with `===`.** Use a constant-time comparison.
- **Base64, not hex.** Comparing a hex digest will always fail.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Header missing | No HMAC Secret set on the connector |
| Always invalid | Wrong secret (copy it again), or a body parser changed the bytes before verification |
| Invalid only on some requests | Middleware re-serializing JSON, or a proxy altering whitespace |
| Works locally, fails behind a gateway | Gateway decompressing or rewriting the body |
