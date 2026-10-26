# How to Verify PlanetScale Webhook Signatures

## How It Works

Every delivery carries `X-PlanetScale-Signature`. Its value is the **lowercase hex digest of HMAC-SHA256** over the **exact raw request body**, keyed with the webhook's secret. It is the whole header value: no `sha256=` prefix, no comma-separated list.

- **Key:** the secret's UTF-8 bytes, used as-is (not hex- or base64-decoded). One secret per webhook.
- **Signed content:** the raw body bytes only. No timestamp, id or other header is signed.
- **Not Standard Webhooks:** there is no `webhook-id` / `webhook-timestamp` / `webhook-signature` header set.
- **No replay window:** nothing signed carries a time to check, so do not invent one from unsigned headers. Dedupe in your handler instead.

## Implementation

PlanetScale has no verification SDK, so the examples verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  if (typeof signatureHeader !== 'string' || !secret) return false;
  // Exactly 64 hex chars first: Buffer.from(x, 'hex') silently drops invalid characters
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), expected);
}
```

`rawBody` must be the `Buffer` (or exact string) that arrived. In Express: `express.raw({ type: '*/*' })`. In Next.js: `Buffer.from(await request.arrayBuffer())`.

### Python

```python
import hmac, hashlib, re

def verify(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    if not re.fullmatch(r"[0-9a-fA-F]{64}", signature_header):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(signature_header.lower().encode("utf-8"), expected.encode("utf-8"))
```

In FastAPI use `await request.body()`.

## Common Gotchas

- **The docs' JavaScript and TypeScript samples are wrong for most setups.** They hash `JSON.stringify(req.body)`, a re-serialization that will not match byte-for-byte (key order and whitespace can differ). The page itself says to use the exact body; the Python and Ruby samples do. Verify the raw bytes.
- **Parse after verifying.** `express.json()` before the check destroys the raw body.
- **No prefix.** Do not look for `sha256=`; a prefixed value is rejected.
- **Case-insensitive hex.** Lowercase both sides (or decode both to bytes) before comparing.
- **Timing-safe compare** after validating length and alphabet.
- **Wrong secret.** Each webhook has its own secret (Show secret). Recreating a webhook gives a new one.
- **Authorization header is separate.** If you configured one, it authenticates PlanetScale to you; it does not replace the signature.

## Debugging Verification Failures

1. Log the raw body length and confirm nothing re-serialized or re-encoded it (no JSON middleware, no proxy rewriting).
2. Confirm `PLANETSCALE_WEBHOOK_SECRET` is the secret of *this* webhook and has no trailing whitespace or newline.
3. Recompute by hand: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$PLANETSCALE_WEBHOOK_SECRET"` and compare with the header.
4. Use **Test webhook** in the dashboard to send a fresh `webhook.test` delivery.
