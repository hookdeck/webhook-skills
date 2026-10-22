# Mautic Signature Verification

## How Does Mautic Sign Webhooks?

Mautic generates a base64-encoded HMAC-SHA256 of the request's **raw body**, keyed with the webhook's secret, and sends it in the `Webhook-Signature` header. Your app computes the same value and compares.

| Item | Value |
|------|-------|
| Header | `Webhook-Signature` |
| Algorithm | HMAC-SHA256 |
| Encoding | base64 (bare value, no prefix) |
| Signed content | raw request body only |
| Key | the webhook secret used as a raw string (no base64/hex decoding) |

This is **not** Standard Webhooks, despite the header name. There is no `webhook-id`, no `webhook-timestamp`, and no `v1,` prefix. Mautic provides no timestamp in the signature, so replay protection is up to you (use idempotency, see the `timestamp` of each event).

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import base64, hashlib, hmac

def verify(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header:
        return False
    expected = base64.b64encode(
        hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(signature_header, expected)
```

Mautic has no official webhook-verification SDK, so all three examples verify manually.

## Common Gotchas

- **Raw body**: verify against the bytes received. Re-serialising parsed JSON changes whitespace and key order and breaks the match.
- **Content type**: don't rely on `application/json`. In Express use `express.raw({ type: '*/*' })` so any content type is read as a raw buffer.
- **Header casing**: `Webhook-Signature` arrives lowercased (`webhook-signature`) in Node and Next.js.
- **Secret is a plain string**: don't base64-decode it, and don't strip any prefix.
- **Batched requests**: in queue mode the signature covers the whole aggregated body; verify once, then iterate over every event type and event.

## How Do I Debug Verification Failures?

1. Confirm the secret matches the one on the webhook's edit page exactly (no trailing whitespace or quotes in `.env`).
2. Log the raw body length and compare with the length Mautic sent (check the request's `Content-Length`).
3. Make sure no middleware (body parser, proxy, gateway) modified or re-encoded the body.
4. Check you're comparing base64 to base64, not hex.
5. If you use several webhooks, make sure each endpoint uses that webhook's own secret.
