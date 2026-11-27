# How to Verify Klaviyo Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is public. Without verification, anyone could POST forged
events to it. Klaviyo signs every **system webhook** so you can confirm a request
genuinely came from Klaviyo and wasn't tampered with in transit.

## How It Works

- **Algorithm:** HMAC-SHA256
- **Key:** the webhook's **secret key** (at least 16 characters), set when you created it
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
- **Check the webhook ID.** Klaviyo says `meta.klaviyo_webhook_id` in the body
  must equal the `Klaviyo-Webhook-Id` header, and not to process the request if
  they differ.
- **Return 200, 201 or 202 within 5 seconds.** Klaviyo counts any other status, or
  a slower response, as a failure and retries. Do heavy processing asynchronously.
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

## Unsigned Flow Webhook Action

A flow **Webhook action** sends a JSON body you write and is **not signed**: there
is no `Klaviyo-Signature` header. Klaviyo lets you add headers to the action
"for authentication", so add one with a long random value and check it
timing-safe:

```javascript
// Flow action header, e.g. X-Webhook-Token: <long random value>
const token = req.get('X-Webhook-Token') || '';
const expected = process.env.KLAVIYO_FLOW_TOKEN;
if (token.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
  return res.status(401).send('Unauthorized');
}
```

Flow requests also carry an `X-Klaviyo-Flow-ID` header with the ID of the flow
that sent them.
