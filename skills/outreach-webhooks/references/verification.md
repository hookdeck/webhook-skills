# Outreach Signature Verification

## How Does Outreach Sign Webhooks?

If the webhook has a `secret`, each request carries `Outreach-Webhook-Signature`: the HMAC hexdigest (SHA-256) of the raw request body, keyed with the secret. Outreach's own example is Ruby: `OpenSSL::HMAC.hexdigest(OpenSSL::Digest.new("sha256"), SECRET, body)`.

- Signed content: the raw body only (no timestamp, no id)
- Encoding: bare lowercase hex, no `sha256=` prefix
- Header: `Outreach-Webhook-Signature` (HTTP headers are case-insensitive)
- No webhook secret means no header

## Implementation

Outreach has no webhook-verification SDK, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyOutreachSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = Buffer.from(signatureHeader.trim().toLowerCase());
  const expectedBuf = Buffer.from(expected);
  return received.length === expectedBuf.length && crypto.timingSafeEqual(received, expectedBuf);
}
```

### Python

```python
import hashlib, hmac

def verify_outreach_signature(raw_body: bytes, signature_header, secret) -> bool:
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.strip().lower().encode(), expected.encode())
```

## Common Gotchas

- **Use the raw body.** Re-serialising parsed JSON changes whitespace and key order. In Express use `express.raw({ type: '*/*' })` so every content type, including `application/vnd.api+json`, stays unparsed.
- **Set a secret first.** A missing header usually means the webhook was created without `secret`.
- **No replay protection.** There is no timestamp in the signature, so make handlers idempotent (for example key on `data.id` + `meta.eventName` + `meta.deliveredAt`).
- **Constant-time compare** and check lengths first, because `timingSafeEqual` throws on unequal lengths.
- **Invalid signatures get no retry.** Outreach never retries on an HTTP status, so a wrongly rejected delivery is lost. Fix the secret before going live.

## Debugging Verification Failures

1. Header missing: the webhook has no `secret`. `PATCH` one on, then redo the action.
2. Header present but mismatched: the secret in your environment differs from the one on the webhook (it is redacted in the API for other apps, so you cannot read it back).
3. Compute the HMAC of the exact bytes you received and compare; if it matches only on a raw capture, your framework is parsing the body first.
