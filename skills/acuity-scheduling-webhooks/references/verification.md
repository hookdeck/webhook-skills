# Acuity Scheduling Signature Verification

## How It Works

Acuity computes the **base64 HMAC-SHA256** of the request body, keyed with your Acuity API key,
and sends it in the `X-Acuity-Signature` header. To verify, compute the same value over the raw
body and compare it to the header. The signed content is the raw body only: there is no timestamp
or message ID, so replay protection comes from idempotency (see webhook-handler-patterns).

## Implementation

Acuity has no SDK verification helper, so verification is manual in every framework.

### Node.js

```javascript
const crypto = require('crypto');

function verifyAcuitySignature(rawBody, signatureHeader, apiKey) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', apiKey).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import base64, hashlib, hmac

def verify_acuity_signature(raw_body: bytes, signature: str | None, api_key: str) -> bool:
    if not signature:
        return False
    digest = hmac.new(api_key.encode(), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64encode(digest).decode(), signature)
```

## Common Gotchas

- **Raw body:** verify the exact bytes received, before parsing the form. In Express use
  `express.raw({ type: '*/*' })`, so verification works whatever `Content-Type` arrives. Don't use
  `express.urlencoded()` first.
- **Key is the API key:** there is no `whsec_` secret. Static webhooks use the main admin's API
  key; dynamic webhooks use the key of the user who created them. Using the wrong account's key
  is the most common cause of failures.
- **Base64, not hex:** the header is base64 of the raw digest.
- **Header casing:** Acuity docs write `x-acuity-signature`; header lookups are case-insensitive
  in Express, Next.js and FastAPI.
- **Docs sample uses `!==`:** compare in constant time instead, as above.
- **Return 400 for bad signatures:** Acuity retries only on 500 or network errors.
- **Key rotation:** regenerating the API key changes the signing key. Update `ACUITY_API_KEY`.

## Debugging Verification Failures

1. Log the raw body length and the received header; confirm the body was not re-encoded.
2. Confirm the key belongs to the account that owns the webhook (main admin for static).
3. Compute the signature manually with `openssl dgst -sha256 -hmac "$KEY" -binary | base64`
   against a captured body.
4. Check proxies or middleware aren't consuming or altering the body.
