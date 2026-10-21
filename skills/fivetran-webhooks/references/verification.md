# How to Verify Fivetran Webhook Signatures

## How It Works

If a `secret` was set when the webhook was created, Fivetran adds `X-Fivetran-Signature-256`: the **hex** HMAC-SHA256 of the **raw request body** keyed with the secret (used as a plain string; not base64-decoded, no `whsec_` handling). No timestamp, no prefix, and no signed ID. The official Python/Flask example uppercases the computed digest and compares it to the uppercased header, so treat the comparison as case-insensitive.

If no secret was set, requests arrive unsigned and cannot be verified. Always set one.

## Implementation

Fivetran provides no verification SDK, so use manual verification.

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex').toUpperCase();
  const actual = signatureHeader.trim().toUpperCase();
  try {
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import hmac, hashlib

def verify(raw_body: bytes, signature_header, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest().upper()
    return hmac.compare_digest(signature_header.strip().upper(), expected)
```

## Common Gotchas

- **Use the raw body.** Express: `express.raw({ type: '*/*' })`; Next.js: `await request.text()`; FastAPI: `await request.body()`. Re-serialising parsed JSON changes bytes and breaks the digest.
- **Case.** The header may be uppercase hex; a naive `===` against a lowercase `hexdigest()` fails.
- **Signing is opt-in.** No `X-Fivetran-Signature-256` header usually means the webhook was created without `secret`.
- **Creation test request.** Fivetran POSTs a test payload while creating the webhook; your endpoint must be up and return 2xx or creation fails with 400. If the test payload is signed, verification must pass.
- **Retries have no ID or timestamp.** Make handlers idempotent.
- **Header name.** HTTP headers are case-insensitive: `x-fivetran-signature-256` in Node/FastAPI/Next.js.

## Debugging Verification Failures

1. Confirm the secret matches the `secret` you sent to the API (it can't be read back; re-set it with `PATCH /v1/webhooks/{id}` ([Modify a webhook](https://fivetran.com/docs/rest-api/api-reference/webhooks/modify-webhook)) if unsure).
2. Log the raw body length and compare to Fivetran's request in the Hookdeck CLI inspector.
3. Check body parsers haven't consumed the stream before your verification.
4. Check for trailing whitespace/newlines in the env var.
