# How to Verify Lodgix Webhook Signatures

## How Does Lodgix Sign Webhooks?

Lodgix sends the signature in `X-Lodgix-Signature` as `sha256=<hash>`, where:

```
hash = HMAC_SHA256(secret, "{X-Lodgix-Timestamp}.{raw request body}")
```

- Algorithm: HMAC-SHA256, output as hex (Lodgix's own n8n example uses HEX)
- Key: the endpoint secret, as its UTF-8 bytes (not hex- or base64-decoded)
- Signed content: the `X-Lodgix-Timestamp` header value, a literal `.`, then the raw body
- This is not Standard Webhooks (no `webhook-id` / `webhook-signature` headers)

There is no official Lodgix SDK for verification, so all examples verify manually.

## Implementation

Build the signed message as **bytes**: the header value encoded latin1 (never
trimmed or reformatted), a UTF-8 `.`, then the body bytes as received. Never decode
the body to a string and re-encode it, and never `JSON.parse`/`JSON.stringify`
before verifying.

### Node.js

```javascript
const crypto = require('crypto');

function verifyLodgixSignature(rawBody, timestamp, signature, secret) {
  if (!timestamp || !signature) return false;
  const hex = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return false;

  const message = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(message).digest();
  const provided = Buffer.from(hex.toLowerCase(), 'hex');
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}
```

### Python

```python
import hashlib, hmac, re

def verify_lodgix_signature(raw_body: bytes, timestamp, signature, secret: str) -> bool:
    if not timestamp or not signature:
        return False
    digest = signature[7:] if signature.startswith("sha256=") else signature
    if not re.fullmatch(r"[0-9a-fA-F]{64}", digest):
        return False
    message = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(digest.lower()), expected)
```

## Timestamp Tolerance (Opt-In)

Lodgix's docs say to reject requests more than 5 minutes old. The examples do **not**
do this by default: Hookdeck retries and replays resend the original headers and
timestamp, and Hookdeck itself applies no tolerance, so a fixed window would reject
legitimate retries. To enable it, set `LODGIX_WEBHOOK_TOLERANCE_SECONDS` to a number
above `0` (for example `300`). `X-Lodgix-Timestamp` is Unix seconds; a missing or
non-numeric timestamp is rejected when tolerance is on. When off, rely on
`X-Lodgix-Delivery` for idempotency.

## Common Gotchas

- **Raw body.** Express: `express.raw({ type: '*/*' })`; Next.js:
  `await request.arrayBuffer()`; FastAPI: `await request.body()`. Parse JSON only
  after the check.
- **Prefix.** The header value is `sha256=<hex>`. Strip the prefix; the bare digest
  is also accepted.
- **Hex case.** Compare case-insensitively: lowercase both sides (or compare bytes).
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops bad
  characters, so check for exactly 64 hex characters first.
- **Constant-time compare** on equal-length bytes (`crypto.timingSafeEqual`,
  `hmac.compare_digest` on `bytes`, never `str`).
- **Header is part of the signed message.** Use the `X-Lodgix-Timestamp` value
  exactly as received.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always 401 | Wrong secret, or body parsed/re-serialized before verifying |
| Fails only on some bodies | Body decoded to a string (non-UTF-8 bytes changed) |
| Fails behind a proxy | Proxy rewrote the body; verify the original bytes or use Hookdeck |
| Fails after a delay with tolerance on | Retry/replay carries the original old timestamp |
| 401 with missing header | A proxy stripped `X-Lodgix-Timestamp` or `X-Lodgix-Signature` |
