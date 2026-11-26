# How to Verify Attentive Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public HTTPS URL. Without verification, anyone who
discovers it could POST forged events. Verifying the `x-attentive-hmac-sha256`
signature proves the request came from Attentive and that the body was not
altered in transit. It is optional but **strongly recommended**.

## How It Works

Attentive computes an HMAC-SHA256 over the **raw request body** using your
per-webhook **Signing key** (from the custom app's Webhooks tab), hex-encodes the digest, and
sends it in the `x-attentive-hmac-sha256` header.

- **Algorithm:** HMAC-SHA256
- **Encoding:** hexadecimal (lowercase)
- **Signed content:** the exact raw request body bytes
- **Header:** `x-attentive-hmac-sha256`
- **Secret:** the signing key from the webhook settings (dashboard or API)

> **Not Standard Webhooks.** Attentive does **not** follow the Standard Webhooks
> spec. There is no `webhook-id` / `webhook-timestamp` / `webhook-signature`
> header and **no timestamp is included in the signature**, so the signature
> alone provides no replay protection. If you need replay protection, add your
> own (payloads carry no event ID, so make handlers idempotent and check the
> payload `timestamp`, or front the endpoint with an event gateway).

There is **no official server-side SDK** (npm/pip) for verification — verify
manually with your language's HMAC primitives.

## Implementation

### Manual Verification (all frameworks)

**Node.js**

```javascript
const crypto = require('crypto');

function verifyAttentiveWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody) // rawBody must be the raw Buffer/string, not re-serialized JSON
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // mismatched length or non-hex input
  }
}
```

**Python**

```python
import hmac
import hashlib

def verify_attentive_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```

## Common Gotchas

- **Use the raw body.** Compute the HMAC over the exact bytes Attentive sent. If
  you parse JSON and re-serialize it, key ordering and whitespace change and the
  signature will never match. In Express use `express.raw()`; in Next.js use
  `await request.text()`; in FastAPI use `await request.body()`.
- **Hex, not base64.** The digest is hex-encoded. Comparing against a base64
  digest always fails.
- **Header name is lowercase.** Most frameworks normalize headers to lowercase;
  read `x-attentive-hmac-sha256`.
- **No timestamp / no replay window.** Don't look for a timestamp in the
  signature — there isn't one. Add your own replay protection if you need it.
- **Timing-safe comparison.** Use `crypto.timingSafeEqual` /
  `hmac.compare_digest`, and guard against length mismatches (non-hex or
  truncated headers) so verification returns `false` instead of throwing.
- **Right secret per webhook.** Each webhook has its own signing key. If you run
  multiple webhooks, verify with the key that belongs to the one that sent the
  request.

## How to Debug Verification Failures

1. **Log the computed digest vs. the header** (never log the secret) to see
   whether you're close. A completely different value usually means the body was
   modified before hashing.
2. **Confirm you're hashing the raw body**, not a parsed-and-re-serialized
   object. This is the most common cause of failures.
3. **Check the encoding** — you should be producing a 64-character lowercase hex
   string.
4. **Verify the secret** matches the signing key shown in the webhook settings
   for this specific webhook.
5. **Check middleware** isn't consuming or transforming the body before your
   handler reads it (JSON body parsers are the usual culprit).
