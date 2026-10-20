# How to Verify Cal.com Webhook Signatures

## How Does Cal.com Sign Webhooks?

When the webhook has a **secret**, Cal.com computes:

```
x-cal-signature-256 = hex( HMAC-SHA256( key = secret, message = raw request body ) )
```

- **Header**: `X-Cal-Signature-256` (HTTP headers are case-insensitive; most frameworks expose it
  as `x-cal-signature-256`).
- **Algorithm**: HMAC-SHA256.
- **Encoding**: lowercase hex, 64 characters, **no** `sha256=` prefix (unlike GitHub).
- **Signed content**: the exact body bytes sent — no timestamp, no id. This is not the Standard
  Webhooks scheme.
- **No secret**: the header is the literal string `no-secret-provided`.

There is no official Cal.com SDK helper for verifying webhooks, so all three examples use the
platform crypto library.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyCalComWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false; // different lengths
  }
}
```

### Python

```python
import hmac, hashlib

def verify_cal_com_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.encode(), expected.encode())
```

## Common Signature Verification Errors

- **Parsing before verifying.** `express.json()`, `await request.json()`, or FastAPI body models
  re-serialize the body and change bytes. Read the raw body (`express.raw()`, `request.text()`,
  `await request.body()`) and verify that.
- **Only accepting JSON.** If you use a custom payload template that isn't valid JSON, Cal.com sends
  `application/x-www-form-urlencoded`. `express.raw({ type: 'application/json' })` would leave
  `req.body` empty and verification fails — accept any content type for the raw body.
- **Expecting a prefix.** There is no `sha256=`; compare the header value directly.
- **`no-secret-provided`.** The webhook has no secret. Set one in Cal.com and in your env.
- **Secret mismatch after editing.** Changing the secret in Cal.com takes effect immediately; update
  `CALCOM_WEBHOOK_SECRET` at the same time.
- **Proxies rewriting the body.** Anything that re-encodes JSON (pretty-printing, charset changes)
  between Cal.com and your handler breaks the HMAC.
- **No replay protection.** The signature has no timestamp, so a captured request stays valid.
  Deduplicate on `triggerEvent` + booking `uid` (or `createdAt`) if replays matter.

## Custom Headers vs. Signature

Cal.com's custom webhook headers (for example `Authorization: Bearer …`) are sent in addition to
the signature. They are static and useful for gateways that need an API key, but the HMAC signature
is the integrity check — verify it even when you also check a custom header.

## How to Debug Verification Failures

1. Log the raw body length and the received `x-cal-signature-256`.
2. Recompute locally:

   ```bash
   printf '%s' "$RAW_BODY" | openssl dgst -sha256 -hmac "$CALCOM_WEBHOOK_SECRET" -hex
   ```

3. If the digests differ, the body was altered or the secret is wrong. If the header is
   `no-secret-provided`, no secret is configured on the webhook.
4. Use `npx hookdeck-cli listen 3000 cal-com --path /webhooks/cal-com` to capture the exact request
   and replay it while you debug.
