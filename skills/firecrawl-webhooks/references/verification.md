# Firecrawl Signature Verification

## How Does Firecrawl Sign Webhooks?

Every delivery carries:

```
X-Firecrawl-Signature: sha256=<hex digest>
```

The digest is HMAC-SHA256 of the **raw request body**, keyed with your account webhook secret (Account settings > Advanced). Only the body is signed: no timestamp, no message ID. Firecrawl documents no other signature header.

## Implementation

Firecrawl publishes no SDK helper for this, so verification is manual in all frameworks.

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  const [algo, sig] = (signatureHeader || '').split('=');
  if (algo !== 'sha256' || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig.toLowerCase()), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import hmac, hashlib

def verify(raw_body: bytes, signature_header: str, secret: str) -> bool:
    algo, _, sig = (signature_header or "").partition("=")
    if algo != "sha256" or not sig:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig.encode(), expected.encode())
```

## Common Gotchas

- **Use the raw body.** Parsing JSON and re-serializing changes bytes. In Express use `express.raw({ type: '*/*' })` (not `express.json()`); in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Don't depend on Content-Type.** `express.raw({ type: 'application/json' })` skips other content types and leaves `req.body` unparsed; `'*/*'` always yields a Buffer.
- **Strip the `sha256=` prefix** before comparing, and split on the first `=` only.
- **One secret per account**, shared by every job. Rotating it in settings invalidates the old secret immediately.
- **No replay protection.** The signature has no timestamp, so dedupe on `webhookId` (see the handler-patterns idempotency reference).
- **Custom `headers`** in the webhook config are not signed; don't treat them as authentication.

## Debugging Verification Failures

- 400 (invalid signature) on every request: wrong `FIRECRAWL_WEBHOOK_SECRET` (copy from the Advanced tab, no quotes or trailing whitespace).
- Works for some jobs only: a middleware (JSON parser, proxy) is altering the body before verification.
- Header missing: a proxy stripped it, or the request did not come from Firecrawl.
