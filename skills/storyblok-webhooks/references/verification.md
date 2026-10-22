# How to Verify Storyblok Webhook Signatures

## How It Works

When a **Webhook secret** is set, every request carries a `webhook-signature` header:

- Algorithm: **HMAC-SHA1**
- Key: the Webhook secret string, used as-is
- Message: the **raw request body**, exactly as received
- Encoding: lowercase **hex** digest (40 characters), no prefix such as `sha1=`
- No timestamp, no message ID

Verification: compute `hex(HMAC_SHA1(secret, rawBody))` and compare with the header in constant time.

### This Is Not Standard Webhooks

The header name matches the Standard Webhooks `webhook-signature`, but nothing else does. There is no `webhook-id` or `webhook-timestamp`, the value has no `v1,` prefix, it is not base64, and the secret has no `whsec_` form. The `standardwebhooks` and `svix` libraries will always reject Storyblok requests. Storyblok has no webhook verification SDK, so use the manual approach.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyStoryblokWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  const received = signatureHeader.trim().toLowerCase();
  if (received.length !== expected.length) return false; // timingSafeEqual throws on length mismatch
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}
```

Express: `app.post('/webhooks/storyblok', express.raw({ type: '*/*' }), handler)`. `req.body` is a `Buffer`. Next.js App Router: `await request.text()` before anything else.

### Python

```python
import hashlib, hmac

def verify_storyblok_webhook(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(signature_header.strip().lower().encode(), expected.encode())
```

FastAPI: `await request.body()` gives the raw bytes.

## Common Gotchas

- **Raw body.** Storyblok sends JSON as raw text; parsing and re-serializing changes bytes and breaks the hash. In Express use `express.raw({ type: '*/*' })` so any content type is captured as a `Buffer`; do not put `express.json()` ahead of the route.
- **Secret mismatch.** The secret is a plain string. Do not base64-decode it, and watch for stray whitespace or quotes in `.env`.
- **SHA-1, not SHA-256.** `createHmac('sha256', ...)` will never match.
- **No signature on free plans or task webhooks.** Webhook secrets need a paid plan. Task (Tasks app) webhooks are never signed; authenticate them with a secret in the **User dialog** (`dialog_values`) and a separate route.
- **No event header.** Read `action` from the JSON body, after verification, and disambiguate with the entity field.
- **Response format.** Return `2xx` with `content-type: application/json`, including after verification success. Storyblok does not retry failures.
- **Verify first.** Reject before parsing or acting; use 400 for a missing or bad signature.

## Debugging Verification Failures

1. Open **Settings → Webhooks → View logs** and compare the logged payload with what your server received.
2. Log the byte length of the raw body and the computed vs received digest. If lengths differ from the log, middleware is altering the body.
3. Confirm the secret in your env var equals the one in the webhook settings (re-save it if unsure).
4. Confirm a Webhook secret is set at all. With none, there is no `webhook-signature` header to verify.
5. Reproduce locally: `printf '%s' "$BODY" | openssl dgst -sha1 -hmac "$SECRET"` should print the same hex as the header.
