# How to Verify Hyperswitch Webhook Signatures

## How Does Hyperswitch Sign Webhooks?

Hyperswitch signs the serialized webhook body with HMAC-SHA512 and sends the
hex-encoded digest in `X-Webhook-Signature-512`:

| | |
|---|---|
| Header | `X-Webhook-Signature-512` |
| Algorithm | HMAC-**SHA512** (not SHA-256) |
| Key | The business profile's `payment_response_hash_key`, as UTF-8 bytes |
| Message | The **raw request body** bytes, exactly as sent |
| Encoding | Lowercase hex digest, 128 characters, no prefix |

Nothing else is signed: no timestamp, id or other header. There's no replay
window to check, so don't invent one from unsigned headers or body fields. Use
`event_id` for idempotency instead.

## Implementation

No Hyperswitch SDK helper for webhook verification is documented, so the
examples use the platform crypto library.

### Node.js

```javascript
const crypto = require('crypto');

const SIGNATURE_PATTERN = /^[0-9a-fA-F]{128}$/;

function verifyHyperswitchSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return { valid: false, error: 'Missing X-Webhook-Signature-512 header' };
  // Validate before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!SIGNATURE_PATTERN.test(signatureHeader)) return { valid: false, error: 'Malformed signature' };

  const expected = crypto.createHmac('sha512', Buffer.from(secret, 'utf8')).update(rawBody).digest();
  const received = Buffer.from(signatureHeader.toLowerCase(), 'hex');

  // timingSafeEqual throws on unequal lengths, so check first.
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return { valid: false, error: 'Invalid signature' };
  }
  return { valid: true };
}
```

Get the raw body with `express.raw({ type: '*/*' })` in Express, or
`Buffer.from(await request.arrayBuffer())` in a Next.js route handler.

### Python

```python
import hashlib, hmac, re

SIGNATURE_PATTERN = re.compile(r"[0-9a-fA-F]{128}", re.ASCII)

def verify(raw_body: bytes, signature_header, secret: str) -> bool:
    if not signature_header or not SIGNATURE_PATTERN.fullmatch(signature_header):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).digest()
    # Compare bytes, never str: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(bytes.fromhex(signature_header), expected)
```

In FastAPI use `await request.body()`.

## Common Gotchas

- **Re-serialised JSON.** Any byte-level change to the body changes the digest.
  Verify the raw bytes before parsing.
- **Wrong hash.** The digest is HMAC-SHA512 (128 hex characters), not SHA-256 (64).
- **Hex-decoding the key.** The key is the secret's UTF-8 bytes, used as-is.
- **Prefix or list parsing.** The header is the bare digest. Don't strip
  `sha512=` or split on commas.
- **Case.** Compare hex case-insensitively: lowercase the header, or decode both
  sides to bytes, before the constant-time compare.
- **Length checks.** `crypto.timingSafeEqual` throws on unequal lengths, so
  validate the length first.
- **Unsigned deliveries.** If the business profile has no
  `payment_response_hash_key`, the header is missing and verification fails.
- **Wrong profile or mode.** Each profile and mode has its own endpoint, and
  may have its own key.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---|---|
| `Missing X-Webhook-Signature-512 header` | `payment_response_hash_key` isn't set on the business profile |
| `Malformed signature` | Not 128 hex characters: a prefix, whitespace or a different scheme |
| `Invalid signature` | Parsed and re-serialised body, wrong secret (other profile or mode), or a hex-decoded key |

Responses: a missing, empty or malformed header, or a mismatch, returns `401`.
A missing `HYPERSWITCH_WEBHOOK_SECRET` returns `500`, so a misconfigured
server never accepts unverified deliveries.
