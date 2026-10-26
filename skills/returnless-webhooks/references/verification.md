# How to Verify Returnless Webhook Signatures

## How Does Returnless Sign Webhooks?

Returnless generates an HMAC SHA-256 hash of the full request body, using the webhook's signing secret, and sends it in the `X-Signature` header.

| Property | Value |
|----------|-------|
| Header | `X-Signature` |
| Value | Bare lowercase hex digest, 64 characters, no prefix |
| Algorithm | HMAC-SHA256 |
| Key | The signing secret's UTF-8 bytes, used as-is (not hex- or base64-decoded) |
| Signed message | The raw request body bytes only |
| Timestamp | None. Nothing else is signed, so there is no replay window to enforce |

## Implementation

There is no Returnless SDK for verification, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyReturnlessWebhook(rawBody, signatureHeader, secret) {
  if (!secret || typeof signatureHeader !== 'string') return false;
  // Validate format first: Buffer.from(x, 'hex') silently drops bad characters
  if (!/^[0-9a-fA-F]{64}$/.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // Both buffers are 64 bytes, so timingSafeEqual cannot throw
  return crypto.timingSafeEqual(Buffer.from(signatureHeader.toLowerCase()), Buffer.from(expected));
}
```

`rawBody` must be a `Buffer`. In Express use `express.raw({ type: '*/*' })`; in Next.js use `Buffer.from(await request.arrayBuffer())`.

### Python

```python
import hashlib, hmac, re

def verify_returnless_webhook(raw_body: bytes, signature_header, secret) -> bool:
    if not secret or not signature_header or not re.fullmatch(r"[0-9a-fA-F]{64}", signature_header):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.lower().encode(), expected.encode())
```

In FastAPI, use `await request.body()`.

## Common Gotchas

- **Use the raw bytes.** Do not decode to a string and re-encode, and never `JSON.parse`/`JSON.stringify` before verifying; whitespace or key-order changes break the hash.
- **No prefix.** The header is the digest alone. Do not strip `sha256=` or split on commas.
- **Case.** Compare hex case-insensitively: check for exactly 64 hex characters, then lowercase before the constant-time compare.
- **Unvalidated hex.** Check length and alphabet first; don't call `Buffer.from(sig, 'hex')` on an unchecked value.
- **Event name is a header.** Read `X-Event-Name`; the body does not contain the event.
- **One secret per webhook.** Test-mode and live webhooks have different secrets.
- **Content type.** Returnless sends `application/json`, but reading raw bytes for any content type is safest.

## What Status Code Should I Return?

- Missing, empty, malformed or mismatched signature: `401`
- Valid signature but unparsable JSON: `400`
- Secret not configured on your server: `500`
- Success (including events you ignore): `2XX`. Anything else triggers retries.

## How Do I Debug Verification Failures?

1. Confirm the secret belongs to the same webhook (test vs live) that sent the request.
2. Log the raw body length and compare with the `Content-Length` header; a mismatch means a proxy or body parser changed the bytes.
3. Compute the HMAC locally over the exact captured body and compare with `X-Signature`.
4. Make sure no trailing newline or whitespace was added to the secret in your `.env`.
