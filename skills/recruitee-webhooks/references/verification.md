# How to Verify Recruitee Webhook Signatures

## How Does Recruitee Sign Webhooks?

Every request includes `X-Recruitee-Signature`: the **base16 (hex) HMAC-SHA256**
digest of the **raw request body**, keyed with your webhook secret. There is no
timestamp, no prefix (`sha256=`), and no base64. Recruitee does not ship an SDK.

```
signature = hex( HMAC_SHA256(key = webhook_secret, message = raw_body_bytes) )
```

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyRecruiteeWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // Compare hex strings as UTF-8 bytes; Buffer.from(x, 'hex') stops at the first non-hex char
  const received = Buffer.from(signatureHeader.trim().toLowerCase(), 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return received.length === wanted.length && crypto.timingSafeEqual(received, wanted);
}
```

### Python

```python
import hmac, hashlib

def verify_recruitee_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.strip().lower().encode(), expected.encode())
```

## Test Vector From the Docs

- Secret: `DuP4ej5yyJB5TIrIEI/dCtJN7sHj` (used as the literal string, not decoded)
- Body: the `candidate_moved` / `stage_changed` example (id 30) from the Recruitee docs, compact JSON with sorted keys
- Expected `X-Recruitee-Signature`: `3b64e3049cb9e108fbb18a453e909cb4a32e3ae140ea01d84c2b5d316c19162f`

Reproduce it with `echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET"`. The
example tests in this skill assert it.

## Common Gotchas

- **Use the raw body.** Re-serialising parsed JSON changes key order and spacing and breaks the digest. In Express use `express.raw({ type: '*/*' })` so any content type reaches the verifier as a Buffer; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **The secret is a plain string.** Do not base64-decode it.
- **Handle the test request.** `{"test":true}` must get a 200 or **Verify and create** fails.
- **Only 200 is success.** 202/204 and 4xx/5xx all trigger retries (up to nine). An invalid signature should return 400 and will be retried by Recruitee until it gives up, so fix the secret rather than ignore the log.
- **Dedupe on `id`.** Retries reuse the event `id` and bump `attempt_count`.
- **No replay window.** The signature does not cover a timestamp; `created_at` is the event time, not the send time, and does not change on retries, so do not reject old `created_at` values.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Body was parsed/re-serialised before verifying, or wrong secret (check **Settings → Apps and Plugins → Webhooks**) |
| Invalid only in production | A proxy/middleware rewrote the body (compression, whitespace) |
| `timingSafeEqual` throws | Header is not valid hex or has a different length: catch and return false |
| Test request fails on create | Handler rejected `{"test":true}` or returned non-200 |
