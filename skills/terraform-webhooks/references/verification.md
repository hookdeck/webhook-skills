# How to Verify HCP Terraform Notification Signatures

## How It Works

For generic destinations that have a token configured, HCP Terraform signs every
notification request:

- **Header:** `X-TFE-Notification-Signature`
- **Algorithm:** HMAC-SHA512
- **Encoding:** hex digest (128 characters)
- **Signed content:** the raw request body
- **Key:** the notification configuration's token

There is no timestamp and no message ID, so the signature gives no replay
protection. Dedupe on `run_id` plus the trigger if duplicates matter.

HashiCorp's own sample is Ruby:

```ruby
hmac = OpenSSL::HMAC.hexdigest(OpenSSL::Digest.new("sha512"), token, @request.body)
fail "Invalid HMAC" if hmac != @request.headers["X-TFE-Notification-Signature"]
```

## Implementation

HCP Terraform has no webhook-verification SDK, so verification is manual in every
framework.

### Node.js

```javascript
const crypto = require('crypto');

function verifyTerraformSignature(rawBody, signatureHeader, token) {
  if (!signatureHeader || !token) return false;
  const expected = crypto.createHmac('sha512', token).update(rawBody).digest('hex');
  try {
    const received = Buffer.from(signatureHeader, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    return received.length === expectedBuf.length && crypto.timingSafeEqual(received, expectedBuf);
  } catch {
    return false;
  }
}
```

### Python

```python
import hmac, hashlib

def verify_terraform_signature(raw_body: bytes, signature_header: str, token: str) -> bool:
    if not signature_header or not token:
        return False
    expected = hmac.new(token.encode(), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(signature_header.lower(), expected)
```

## Common Gotchas

- **The signature is optional.** If the configuration has no token, there is no
  header. A handler that only verifies "when the header is present" accepts forged
  requests, so require the header and reject missing ones.
- **SHA-512, not SHA-256.** The digest is 128 hex characters.
- **Raw body.** Verify the bytes as received before `JSON.parse`. In Express use
  `express.raw({ type: '*/*' })` so any content type works; `express.json()` would
  re-serialize and break the match.
- **The token can't be read back.** If you lose it, edit the configuration and set
  a new one.
- **Verification request is signed too.** If your handler rejects it (wrong or
  missing token), the configuration can't be enabled.
- **Two payload shapes.** Run payloads have `notifications[].trigger`; workspace
  payloads have a top-level `trigger`. Don't assume the array exists.
- **Compare as bytes.** Hex case can differ across implementations; decode or
  lowercase before comparing.

## Debugging Verification Failures

1. Check the **Last Response** box on the notification configuration for the status
   and body your endpoint returned.
2. Confirm the handler token equals the one on the configuration (no trailing
   newline from `.env` or a secrets manager).
3. Confirm you hash the unmodified body, not re-serialized JSON, and that no proxy
   rewrites it.
4. Confirm the digest is SHA-512 hex and that you read `x-tfe-notification-signature`
   (header names are case-insensitive).
