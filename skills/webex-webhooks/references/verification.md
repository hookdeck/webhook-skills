# Webex Signature Verification

## How Does Webex Webhook Signature Verification Work?

If you create a webhook with a `secret`, Webex adds an **`X-Spark-Signature`** header to every delivery for that webhook, whatever the resource. The value is the **lowercase hex HMAC-SHA1** of the **unmodified raw request body**, keyed with your secret string used as-is (not base64-decoded). Nothing else is signed: no timestamp, no webhook ID, no prefix.

Some webhook types also send **`X-Webex-Signature`** with HMAC-SHA256 or HMAC-SHA512 signatures. Webex says to prefer it where present and to choose the digest from what the header indicates, but the header format isn't spelled out in the public webhook guide. `X-Spark-Signature` is the header that is present for every signed webhook, so this skill and its examples verify that one. HMAC-SHA1 is weak as a general choice, but it is the documented Webex contract.

Header names are case-insensitive, and HTTP/2 may deliver them lowercase, so use your framework's case-insensitive lookup.

## Implementation

Webex provides no SDK helper for verifying webhook signatures, so verify manually. Both are timing-safe.

### Node.js

```javascript
const crypto = require('crypto');

function verifyWebexWebhook(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // Length mismatch = invalid
  }
}
```

### Python

```python
import hmac, hashlib

def verify_webex_webhook(raw_body: bytes, signature: str, secret: str) -> bool:
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(signature, expected)
```

## Common Gotchas

- **Raw body only.** Hash the exact bytes received. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **No secret, no signature.** If the webhook was created without `secret`, there is no header at all. Reject such requests rather than skipping verification, and recreate the webhook with a secret.
- **The secret is a plain string.** Don't base64-decode it or strip a prefix.
- **No timestamp, so no replay window.** Make the handler idempotent. The envelope `id` is the webhook ID, so key on `resource` + `event` + `data.id` instead.
- **Signature mismatches after a secret change.** Updating the webhook's secret requires updating the handler's environment variable too.
- **Re-serializing proxies.** Anything between Webex and your handler that re-serializes the JSON will break verification.

## How Do I Debug Verification Failures?

1. Log the received `x-spark-signature` and the signature you compute (never the secret) and compare lengths: SHA-1 hex is 40 characters.
2. Confirm the request has the header at all. No header means the webhook has no secret (update it with a `secret`, or recreate it).
3. Confirm your framework isn't parsing the body first (a JSON body parser registered globally is the usual cause).
4. Confirm the env var matches the secret used when the webhook was created or last updated, with no trailing newline or quotes.
5. If you are using the Hookdeck Event Gateway, set the source's webhook secret to the same value and verify on the Hookdeck source.
