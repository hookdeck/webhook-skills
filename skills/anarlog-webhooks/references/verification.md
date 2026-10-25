# How to Verify Anarlog Webhook Signatures

## How It Works

Each delivery carries `x-anarlog-signature: sha256=<hex>`. The value is the HMAC-SHA256 of the **exact raw request body**, keyed with the endpoint's `whsec_...` signing secret, hex encoded and prefixed with `sha256=`.

- **Key:** the entire secret string, `whsec_` prefix included, as UTF-8 bytes.
- **Signed content:** the raw body only. `x-anarlog-timestamp` is sent but is not part of the signature.
- **Not Standard Webhooks:** despite the `whsec_` look, do not use the `standardwebhooks` or `svix` libraries, and do not strip or base64-decode the prefix. There is no `webhook-id` / `webhook-timestamp` / `webhook-signature` header set.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  if (typeof signatureHeader !== 'string' || !secret) return false;
  if (!signatureHeader.startsWith('sha256=')) return false;
  const received = signatureHeader.slice('sha256='.length);
  // Exactly 64 hex chars first: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}
```

Anarlog's own docs compare the full `sha256=...` strings as equal-length UTF-8 Buffers with `crypto.timingSafeEqual` after a byte-length check; that is equivalent for lowercase hex.

### Python

```python
import hmac, hashlib

def verify(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret or not signature_header.startswith("sha256="):
        return False
    received = signature_header[len("sha256="):].lower()
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Encode both sides: hmac.compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(received.encode("utf-8"), expected.encode("utf-8"))
```

## Common Gotchas

- **Raw body:** in Express use `express.raw({ type: '*/*' })` so any content type verifies; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Secret includes `whsec_`:** stripping it gives a different key and every signature fails.
- **Require the `sha256=` prefix** and strip it before comparing.
- **Timing-safe compare** with a length/format check first.
- **Replay protection is optional:** the timestamp is unsigned. Anarlog suggests rejecting stale `created_at` values and storing each payload `id`. Retries re-send the same body, so a strict window can reject legitimate retries.
- **Secret shown once:** if lost, you need to create a new endpoint to get a new secret.

## Debugging Verification Failures

1. Log the raw body length and confirm it matches what was sent (no JSON re-serialization, no proxy rewriting).
2. Confirm the secret in your environment starts with `whsec_` and has no trailing whitespace or newline.
3. Recompute: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$ANARLOG_WEBHOOK_SECRET"` and compare with the header hex.
4. Click **Test** in Anarlog to send a fresh `webhook.test` delivery.
