# How to Verify Shortcut Webhook Signatures

## How Does Shortcut Sign Webhooks?

If you provide a secret when creating the Outgoing Webhook, each request includes the header `Payload-Signature`. Per the docs:

- The value is a cryptographic hash in hexadecimal form encoded in UTF-8
- The algorithm is HMAC-SHA-256
- The message is the HTTP request body encoded in UTF-8
- The key is the secret string you provided, encoded in UTF-8

So: `hex(HMAC_SHA256(key = secret, message = raw body))`. There is no `sha256=` prefix, no timestamp in the signed content, and no SDK helper.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyShortcutWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
```

### Python

```python
import hmac, hashlib

def verify_shortcut_webhook(raw_body: bytes, signature_header, secret) -> bool:
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.strip().lower().encode(), expected.encode())
```

## Common Gotchas

- **No secret, no signature.** If the webhook was created without a secret, the header is absent. Create it with a secret and reject requests without a valid signature.
- **Use the raw body.** Do not parse and re-serialize JSON before hashing. In Express use `express.raw({ type: '*/*' })`; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Any content type.** Do not restrict raw parsing to `application/json`, or a differing content type will skip the raw parser and verification will fail.
- **Header casing.** Frameworks lowercase header names: read `payload-signature`.
- **Length mismatch.** `crypto.timingSafeEqual` throws on unequal lengths; catch it and treat as invalid.
- **No replay protection.** The signature has no timestamp. Deduplicate on the event `id`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Header missing | Webhook created without a secret |
| Always invalid | Secret mismatch (whitespace, wrong env var) or body modified by middleware |
| Invalid only for some requests | Body parsed by a JSON middleware registered before the raw parser |
| Works locally, fails behind a proxy | Proxy rewrites the body; compare the bytes you receive |
