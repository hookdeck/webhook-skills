# How to Verify Doppler Webhook Signatures

## How It Works

When a webhook has a **Secret**, Doppler adds `X-Doppler-Signature: sha256=<hex>`, where `<hex>` is the lowercase hex HMAC-SHA256 of the request body keyed on the Secret. The signature covers the body only: no timestamp, no message ID. A custom JSON payload is signed as the request body too.

If no Secret is set the header is absent and there is nothing to verify, so reject unsigned requests in your handler.

## Implementation

Doppler has no webhook SDK; verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hmac, hashlib

def verify(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header, expected)
```

## Common Gotchas

- **Use the raw body, not `JSON.stringify(req.body)`.** Doppler's docs sample uses `bodyParser.json()` and re-serializes. That only matches when the re-serialized JSON is byte-identical to what was sent (key order, whitespace, unicode escapes), and it breaks for custom payloads. In Express use `express.raw({ type: '*/*' })`; in Next.js `await request.text()`; in FastAPI `await request.body()`.
- **Any content type.** `express.raw({ type: 'application/json' })` skips other content types, leaving `req.body` as `{}` and failing verification. `type: '*/*'` avoids that.
- **The `sha256=` prefix is part of the value.** Compare the whole header string, or strip the prefix on both sides.
- **Check lengths before `timingSafeEqual`.** It throws on unequal lengths (the docs' sample would crash on a malformed header).
- **Signing is optional on Doppler's side.** Fail closed if your secret is not configured.
- **Custom payloads have no `type`.** Verify first, then branch on `type` only if present.

## Debugging Verification Failures

1. Header missing: no Secret on the webhook; edit it in Doppler.
2. Mismatch: confirm the Secret in Doppler equals `DOPPLER_WEBHOOK_SECRET` exactly (no trailing newline or quotes).
3. Mismatch only on some requests: a parser re-encoded the body; check you read raw bytes before any JSON middleware.
4. Compare against the payload shown in the Logs tab on the webhook's page in Doppler.
