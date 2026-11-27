# How to Verify Nuvemshop (Tiendanube) Webhook Signatures

## How It Works

Nuvemshop signs webhooks created through the API so you can confirm they came
from Nuvemshop and were not tampered with. The docs don't say whether the required
privacy webhooks set in the Partners Portal are signed.

- **Algorithm:** HMAC-SHA256
- **Key:** your app's **client secret** (the OAuth app secret)
- **Signed content:** the **raw request body** (exact bytes, before any JSON parsing)
- **Encoding:** lowercase **hex**
- **Header:** `x-linkedstore-hmac-sha256`

This is a custom single-header scheme — **not** the Standard Webhooks spec.
There is no `webhook-id` / `webhook-timestamp` / `webhook-signature`, and there
is **no timestamp** in the signed content.

There is **no official SDK** (community libraries only), so verification is
implemented manually in every language.

## Implementation

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyNuvemshopWebhook(rawBody, hmacHeader, clientSecret) {
  if (!hmacHeader) return false;
  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(rawBody)            // rawBody must be the exact bytes received
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(expected));
  } catch {
    return false;               // different lengths => invalid
  }
}
```

### Python (FastAPI)

```python
import hmac, hashlib

def verify_nuvemshop_webhook(raw_body: bytes, hmac_header: str, client_secret: str) -> bool:
    if not hmac_header:
        return False
    expected = hmac.new(client_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(hmac_header, expected)
```

## Common Gotchas

- **Use the raw body.** Verify against the exact bytes received. If your
  framework parses JSON first and you re-serialize it, whitespace/key-order
  differences will change the hash and verification will fail. In Express use
  `express.raw()`; in Next.js use `await request.text()`; in FastAPI use
  `await request.body()`.
- **The key is the client secret**, not an access token and not a separate
  "webhook secret". It's the same secret used for OAuth token exchange.
- **Hex, not base64.** The digest is hex-encoded (unlike Shopify, which uses
  base64). Don't base64-decode the header.
- **No timestamp.** There's nothing to check for replay tolerance in the
  signature itself. If you need replay protection, dedupe on the whole body,
  including `event_launch_ts` where it's sent: `store_id` + `event` + `id` alone
  repeats across real changes to the same resource.
- **Constant-time compare.** Use `crypto.timingSafeEqual` /
  `hmac.compare_digest`, and guard against buffer length mismatches (they throw
  in Node).
- **Header casing.** HTTP headers are case-insensitive; most frameworks
  lowercase them, so read `x-linkedstore-hmac-sha256`.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Always invalid | Verifying the parsed/re-serialized body instead of the raw body |
| Always invalid | Using an access token or wrong secret instead of the app **client secret** |
| Always invalid | Base64-decoding the header (it's hex) |
| `timingSafeEqual` throws | Comparing buffers of different lengths — wrap in try/catch and return false |
| Works locally, fails behind proxy | A proxy/body parser mutated the payload before your handler saw it |

## Respond Quickly

Nuvemshop waits only **3 seconds** for a `2XX`. Verify, enqueue any heavy work,
and return `200` immediately. Non-2XX or timeouts trigger retries (up to 16
notifications over 48h), so make handlers idempotent.
