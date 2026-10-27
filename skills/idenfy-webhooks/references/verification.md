# How to Verify iDenfy Webhook Signatures

## How Does iDenfy Sign Webhooks?

| Item | Value |
|------|-------|
| Header | `Idenfy-Signature` |
| Algorithm | HMAC-SHA256 |
| Signed content | The raw request body only (no timestamp, no ID, no other header) |
| Key | The signing key set on the webhook, used as a UTF-8 string |
| Encoding | Bare lowercase hex (64 characters), no prefix |

The header is sent when the webhook has a signing key. iDenfy's signing page says every
request carries it, but its troubleshooting and the KYC header table make it conditional on
the key, so an unsigned webhook has no header and fails verification.

## Implementation

iDenfy has no webhook SDK, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyIdenfySignature(rawBody, signature, secret = process.env.IDENFY_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string') return false;
  // Exactly 64 hex chars first: Buffer.from(x, 'hex') silently truncates invalid input.
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
```

### Python

```python
import hashlib, hmac

def verify_idenfy_signature(raw_body: bytes, signature, secret: str) -> bool:
    if not secret or not isinstance(signature, str):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes: compare_digest raises TypeError on non-ASCII str, which would be a 500.
    return hmac.compare_digest(expected.encode("utf-8"), signature.lower().encode("utf-8"))
```

## Common Gotchas

- **Use the raw body.** In Express read it with `express.raw({ type: '*/*' })` so any content
  type is verified (iDenfy's own sample uses `application/json` only). In Next.js use
  `request.arrayBuffer()`; in FastAPI `await request.body()`. Never re-serialize parsed JSON.
- **Signing key is a plain string.** Don't hex- or base64-decode it before keying the HMAC.
- **Hex case.** Compare case-insensitively; iDenfy sends lowercase.
- **No signing key, no header.** Set the key on every webhook you receive.
- **One key per webhook.** Each event type's webhook can have its own key.
- **No timestamp.** Signatures never expire, so deduplicate on `scanRef` (KYC) or `id` (bank
  card) instead of relying on a freshness window.
- **Proxies.** A reverse proxy or load balancer that re-encodes JSON or changes whitespace
  breaks the signature. Verify before any body-transforming middleware.
- **Reject when no secret is configured.** An empty key would make the HMAC trivially forgeable.
- **Status codes.** iDenfy's samples return 403 on a bad signature; this skill returns 401.

## How Do I Debug Verification Failures?

1. Is the header present? If not, no signing key is set on that webhook.
2. Does `IDENFY_WEBHOOK_SECRET` exactly match the **Signing key** on that webhook (no trailing whitespace)?
3. Is something re-encoding the body (a JSON body parser, a proxy)? Log `rawBody.length`.
4. Is the header 64 hex characters? Anything else is rejected before the HMAC is computed.
5. Compute it locally: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET"`.
