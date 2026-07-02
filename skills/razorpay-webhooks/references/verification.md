# Razorpay Signature Verification

## How It Works

Every Razorpay webhook request includes an `X-Razorpay-Signature` header. Its
value is an **HMAC-SHA256** digest, **hex**-encoded, computed over the **raw
request body** using the **webhook secret** you configured in the dashboard as
the key:

```
signature = hex( HMAC_SHA256(key = webhook_secret, message = raw_request_body) )
```

To verify, recompute the HMAC over the raw body you received and compare it to
the header value. This is **not** the Standard Webhooks scheme — there is a
single `X-Razorpay-Signature` header, no `webhook-id`/`webhook-timestamp`
headers, and no timestamp is mixed into the signed content.

| Property | Value |
|----------|-------|
| Header | `X-Razorpay-Signature` |
| Algorithm | HMAC-SHA256 |
| Encoding | Hex |
| Signed content | Raw request body (unmodified bytes) |
| Key | Webhook secret from the dashboard |

## Implementation

### SDK Verification (Node.js — preferred)

The official `razorpay` Node SDK exposes a static helper that computes the HMAC
and compares it for you. It returns a boolean.

```javascript
const Razorpay = require('razorpay');

function verifyRazorpayWebhook(rawBody, signature, secret) {
  if (!signature) return false;
  try {
    // rawBody must be the raw string/Buffer, NOT parsed JSON
    return Razorpay.validateWebhookSignature(rawBody, signature, secret);
  } catch {
    return false; // thrown when any argument is missing/invalid
  }
}
```

The same helper is also importable directly:

```javascript
const { validateWebhookSignature } = require('razorpay/dist/utils/razorpay-utils');
```

### Manual Verification (fallback — e.g. Python/FastAPI)

Razorpay only ships a Node SDK for webhook validation, so in other languages
compute the HMAC yourself and compare with a **timing-safe** function.

Python:

```python
import hmac, hashlib

def verify_razorpay_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header:
        return False
    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,            # raw bytes, NOT parsed JSON
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```

Node (manual, if you prefer not to use the SDK):

```javascript
const crypto = require('crypto');

function verifyRazorpayWebhook(rawBody, signature, secret) {
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)        // Buffer/string of the raw body
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false; // length mismatch → invalid
  }
}
```

> Note: the SDK's `validateWebhookSignature` compares with a plain string
> equality (`===`). The manual snippets above use a timing-safe comparison,
> which is preferable when you implement verification yourself.

## Common Gotchas

- **Use the raw body, not parsed JSON.** Re-serializing (`JSON.stringify`) can
  reorder keys or change whitespace, producing a different HMAC and a false
  mismatch. Capture the raw bytes/string before any JSON parsing.
  - Express: `express.raw({ type: 'application/json' })` (or `'*/*'`).
  - Next.js App Router: `await request.text()`.
  - FastAPI: `await request.body()`.
- **Secret, not API key.** The signing key is the webhook secret you set in the
  dashboard, not your Razorpay API Key ID or Key Secret.
- **Hex, not base64.** Razorpay encodes the signature as hex.
- **Header casing.** HTTP headers are case-insensitive; frameworks lowercase
  them (`x-razorpay-signature`). Read them case-insensitively.
- **Event type is in the body**, not a header. Dispatch on the JSON `event`
  field after verifying.
- **Test vs Live secrets differ.** A signature computed with the wrong mode's
  secret will fail — make sure the secret matches the mode that sent the event.

## Debugging Verification Failures

1. **401 on every request** — Confirm `RAZORPAY_WEBHOOK_SECRET` matches the
   secret configured for the correct mode (Test vs Live).
2. **Works locally, fails in prod** — A proxy or body parser is likely mutating
   the body. Ensure the raw body reaches your verification untouched.
3. **Intermittent failures right after a secret change** — Retried older events
   were signed with the previous secret; keep the old secret available until
   retries drain.
4. **Always fails despite correct secret** — You are probably hashing parsed/
   re-stringified JSON. Hash the exact raw bytes received.
