# How to Verify Klaviyo Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is public. Without verification, anyone could POST forged
events to it. Klaviyo signs every **system webhook** so you can confirm a request
genuinely came from Klaviyo and wasn't tampered with in transit.

## How It Works

- **Algorithm:** HMAC-SHA256
- **Key:** your endpoint **secret** (min 16 chars), set when the webhook was created
- **Signed content:** the **raw request body** with the **`Klaviyo-Timestamp`**
  header value **appended** — i.e. `HMAC(secret, raw_body + timestamp)`
- **Encoding:** lowercase **hex**
- **Header carrying the signature:** `Klaviyo-Signature`

Relevant request headers:

| Header | Purpose |
|--------|---------|
| `Klaviyo-Signature` | Hex HMAC-SHA256 signature to compare against |
| `Klaviyo-Timestamp` | Timestamp; part of the signed content |
| `Klaviyo-Webhook-Id` | Unique webhook identifier |

There is **no official Klaviyo SDK helper** for webhook verification, so all
frameworks verify manually with the standard crypto library.

## Implementation

### Node.js (manual)

```javascript
const crypto = require('crypto');

function verifyKlaviyoWebhook(rawBody, timestamp, signature, secret) {
  const computed = crypto
    .createHmac('sha256', secret)
    .update(rawBody)     // raw body FIRST (Buffer or string)
    .update(timestamp)   // Klaviyo-Timestamp appended
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;        // different lengths => invalid
  }
}
```

### Python (manual)

```python
import hmac
import hashlib

def verify_klaviyo_webhook(raw_body: bytes, timestamp: str, signature: str, secret: str) -> bool:
    mac = hmac.new(secret.encode(), raw_body, hashlib.sha256)
    mac.update(timestamp.encode())          # append Klaviyo-Timestamp
    return hmac.compare_digest(mac.hexdigest(), signature)
```

## Common Gotchas

- **Use the raw body.** Compute the HMAC over the exact bytes received. If you
  `JSON.parse` and re-serialize, whitespace/key-order differences will change the
  hash and verification will fail. In Express, use `express.raw()`; in Next.js
  use `await request.text()`; in FastAPI use `await request.body()`.
- **Order matters: body then timestamp.** The timestamp is appended **after** the
  body, not prepended. Getting the order wrong produces a different digest.
- **Hex, not base64.** Klaviyo uses `.hexdigest()` — don't base64-encode.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`,
  not `===`, to avoid timing attacks. Guard against length-mismatch throws.
- **Return 2xx quickly.** Acknowledge with a 200 as soon as the signature checks
  out; do heavy processing asynchronously so Klaviyo doesn't retry.
- **Batched events.** One request may contain up to 1,000 events in `data`. The
  signature covers the whole body — verify once, then iterate over `data`.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Always invalid | Body was parsed/re-serialized before hashing — use the raw body |
| Always invalid | Timestamp not appended, or appended before the body |
| Always invalid | Base64 used instead of hex |
| Always invalid | Wrong secret (must match the `secret_key` set on the webhook) |
| Intermittent | Proxy/middleware mutating the body before your handler |

## Unsigned Flow "Webhook" Action

The flow **"Webhook" action** sends a custom payload and is **not signed** — there
is no `Klaviyo-Signature` header. If signing isn't available on your account,
protect the endpoint with a secret token in the URL and reject mismatches:

```javascript
// e.g. endpoint_url = https://your-app.com/webhooks/klaviyo?token=LONG_RANDOM_TOKEN
const token = new URL(req.url, 'http://x').searchParams.get('token');
if (!token || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(process.env.KLAVIYO_URL_TOKEN))) {
  return res.status(401).send('Unauthorized');
}
```

Prefer signed system webhooks whenever your account supports them.
</content>
