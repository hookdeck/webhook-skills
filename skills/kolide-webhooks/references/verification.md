# How to Verify 1Password Device Trust (Kolide) Webhook Signatures

## How Does the Signature Work?

Kolide's docs say each POST includes an `Authorization` header, and that the signature in it is a SHA256 HMAC hexdigest of the JSON payload in the HTTP body, signed with the webhook endpoint's secret:

```
Authorization: c71fd8b49e0736962d16f8410fa0d6f5bb27d7ef35cd1c0b6d4da0b8568921ac
```

The docs' Ruby example is `OpenSSL::HMAC.hexdigest('sha256', SIGNING_SECRET, data)` with `data = request.body.read`.

- Header: `Authorization`, whose whole value is the digest
- Algorithm: HMAC-SHA256, lowercase hex (64 characters)
- Signed content: the raw request body bytes only (no timestamp, id, or other header)
- Key: the endpoint's signing secret as UTF-8 bytes, used as-is
- No `Bearer` scheme, no prefix, no timestamp

## Implementation

Kolide publishes no SDK for verification, so use the standard library.

### Node.js

```javascript
const crypto = require('crypto');

function verifyKolide(rawBody, authorization, secret) {
  if (!secret || typeof authorization !== 'string') return false;
  const received = authorization.trim();
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}
```

### Python

```python
import hashlib, hmac, re

def verify_kolide(raw_body: bytes, authorization, secret: str) -> bool:
    if not secret or authorization is None:
        return False
    received = authorization.strip()
    if not re.fullmatch(r"[0-9a-fA-F]{64}", received):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(received.lower().encode(), expected.encode())
```

## Common Gotchas

- **Raw body only.** Build the signed message from the bytes exactly as received. Never decode and re-encode, and never `JSON.parse`/`JSON.stringify` before verifying. In Express use `express.raw({ type: '*/*' })`; in Next.js `await request.arrayBuffer()`; in FastAPI `await request.body()`.
- **`Authorization` is the signature, not a credential.** Compare the whole value as one digest. Don't split on spaces or strip `Bearer`.
- **Hex is case-insensitive.** Hookdeck compares it that way, so the examples accept upper- or lowercase and lowercase both sides (or decode both to bytes) before the constant-time compare.
- **Validate before decoding.** Require exactly 64 hex characters. `Buffer.from(sig, 'hex')` silently drops invalid characters, and Python's `hmac.compare_digest` raises `TypeError` on a non-ASCII `str`, so compare bytes.
- **The secret is not decoded.** Use its UTF-8 bytes directly, not a hex- or base64-decoded form.
- **No replay window.** No timestamp is signed, so don't invent one from unsigned headers or the body's `timestamp` field. Dedupe on the event `id` instead.
- **Rotation.** Rotating the secret also changes `X-Kolide-Webhook-Identifier`. Update `KOLIDE_WEBHOOK_SECRET` when you rotate.
- **Respond 401** for a missing, empty, malformed, or mismatching `Authorization` value.

## How to Debug Verification Failures

1. Confirm the secret is the one shown by "Reveal Secret" for this endpoint, with no extra whitespace or quotes in your `.env`.
2. Log the length of the raw body and the received header length (it must be 64). A different length means a prefix such as `Bearer` or a proxy rewrote the header.
3. Check that no middleware parsed the body first (`express.json()`, a framework body parser). That changes the bytes.
4. Compute the HMAC locally over the saved raw body and compare with the received value, or use the `webhook.test` event from the admin console.
5. If you receive through Hookdeck, check the delivery in the Hookdeck dashboard: its `KOLIDE` source verifies the signature on arrival, so a failure there points at the secret configured on the source.
