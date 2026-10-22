# MailerLite Signature Verification

## How Does MailerLite Sign Webhooks?

Each request includes a `Signature` header. Its value is the HMAC-SHA256 of the JSON payload, keyed with the webhook's secret, encoded as lowercase hex. MailerLite's reference implementation is PHP:

```php
hash_hmac('sha256', $jsonPayload, $secret);  // hex by default
```

- Header: `Signature`
- Algorithm: HMAC-SHA256
- Signed content: the raw request body, exactly as received
- Secret: the per-webhook `secret` from the webhooks API, used as a UTF-8 string (not base64-decoded, no prefix)
- Encoding: bare hex, no `sha256=` prefix
- No timestamp, so no replay window. Use idempotent handlers

MailerLite provides no webhook verification SDK, so verify manually.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader.trim().toLowerCase()), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import hmac, hashlib

def verify(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.strip().lower().encode(), expected.encode())
```

Encoding both sides to bytes avoids a `TypeError` when a header contains non-ASCII characters.

## Common Gotchas

- **Raw body:** sign the bytes as received. Re-serialising parsed JSON changes whitespace and key order and breaks the signature.
- **Express:** use `express.raw({ type: '*/*' })` rather than `type: 'application/json'`, so verification works for any content type.
- **Header name:** it is plain `Signature`, not `X-Signature` or `X-MailerLite-Signature`. Node lowercases it to `signature`.
- **No prefix:** don't strip `sha256=`. A prefixed value should fail.
- **Secret:** one per webhook. If you have several webhooks pointing at one endpoint, look up the secret by webhook, or use separate endpoints.
- **Length mismatch:** `crypto.timingSafeEqual` throws on different lengths, so catch it and return false.
- **Batched payloads:** the whole `{ events: [...] }` body is signed as one payload. Verify once, then iterate.
- **Status codes:** return 2xx for events you don't handle. A 4xx/5xx triggers retries.

## Debugging Verification Failures

1. Confirm you use the `secret` of the webhook that sent the request (`GET /api/webhooks`).
2. Log the raw body length and compare with the `Content-Length` header; a mismatch means a middleware altered the body.
3. Compute the HMAC with `openssl`:
   ```bash
   printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET"
   ```
4. Check a proxy or framework isn't re-encoding the body (for example Express `json()` or Next.js `request.json()` before `request.text()`).
