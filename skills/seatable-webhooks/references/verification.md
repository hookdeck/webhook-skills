# SeaTable Webhook Signature Verification

## How Does SeaTable Sign Webhooks?

When a secret key is set, SeaTable sends:

```
X-Seatable-Signature: sha256=598b55485e7875def064746867ff220e79d7c75512fdb931a39e313af5abfe60
```

- Algorithm: HMAC-SHA256
- Signed content: the **raw request body** (no timestamp, no id)
- Key: the secret key as a UTF-8 string
- Encoding: lowercase hex, with a `sha256=` prefix

There is no timestamp, so there is no replay window to check.

## Implementation

SeaTable has no webhook verification SDK, so all examples verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const received = signatureHeader.replace(/^sha256=/, '').toLowerCase();
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import hmac, hashlib

def verify(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    if not signature_header or not secret:
        return False
    received = signature_header.removeprefix("sha256=").lower()
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(received, expected)
```

## Common Gotchas

- **No secret, no header.** If the webhook has no secret key, there is nothing to verify. Set one and reject requests that lack the header.
- **Use the raw body.** Re-serialized JSON changes whitespace and key order and breaks the HMAC. In Express use `express.raw({ type: '*/*' })` so it works whatever `Content-Type` arrives; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Strip the `sha256=` prefix** before comparing hex, or add it to your computed value (as the n8n guide does).
- **Header name casing.** Frameworks lowercase it: read `x-seatable-signature`.
- **Keep the secret a string.** Do not base64- or hex-decode it.
- **Failures disable the webhook.** SeaTable marks the webhook `invalid` after 5 consecutive non-200 responses, so a wrong secret in your config eventually stops deliveries. Re-save the webhook to reactivate.

## How Do I Debug Verification Failures?

1. Confirm the webhook actually has a secret (no `X-Seatable-Signature` header means it does not).
2. Confirm `SEATABLE_WEBHOOK_SECRET` matches exactly, with no trailing whitespace or newline.
3. Log the byte length of the body you hash and compare it with `Content-Length`; a mismatch means a middleware parsed or altered the body.
4. If you sit behind a proxy or Hookdeck, check it forwards the body and header unchanged.
