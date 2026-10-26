# How to Verify LearnHouse Webhook Signatures

## How It Works

Every delivery carries `X-Webhook-Signature: sha256=<hex>`, where `<hex>` is the lowercase hex HMAC-SHA256 of the exact raw request body bytes, keyed with the endpoint secret. Nothing else is signed (no timestamp, id or header), so there is no replay window; use `delivery_id` for deduplication instead.

The secret looks like `whsec_...` but this is **not** Standard Webhooks. Use the whole string, prefix included, as the UTF-8 HMAC key: do not strip `whsec_`, do not base64-decode it, and do not use the `standardwebhooks` or `svix` libraries. LearnHouse has no SDK for verification, so verify manually.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyLearnhouseSignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const value = header.startsWith('sha256=') ? header.slice(7) : header;
  if (!/^[0-9a-fA-F]{64}$/.test(value)) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'hex'), expected);
}
```

### Python

```python
import hmac, hashlib, re

def verify_learnhouse_signature(raw_body: bytes, header: str | None, secret: str | None) -> bool:
    if not header or not secret:
        return False
    value = header[len("sha256="):] if header.startswith("sha256=") else header
    if not re.fullmatch(r"[0-9a-fA-F]{64}", value):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(value), expected)
```

## Common Gotchas

- **Raw body bytes.** Express: `express.raw({ type: '*/*' })`. Next.js: `await request.arrayBuffer()`. FastAPI: `await request.body()`. Parse JSON only after the check.
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops bad characters, so check for exactly 64 hex characters first. `timingSafeEqual` throws on unequal lengths.
- **Compare bytes in constant time.** Use `crypto.timingSafeEqual` or `hmac.compare_digest` on bytes, never `==` or a `str` comparison.
- **Prefix optional.** Strip a leading `sha256=`; Hookdeck's parser also accepts the bare digest. Hex is case-insensitive.
- **Secret handling.** Whole `whsec_...` string as UTF-8 bytes, nothing stripped or decoded. After rotating the secret, update the env var.
- **Status codes.** A missing, empty, malformed or mismatched signature gets `401`. A verified body that is not valid JSON or not an object gets `400`. Any `2xx` stops retries.
- **Untrusted fields.** After verifying, check types (`typeof`, `Array.isArray`, `isinstance`) before reading nested fields so a wrong-typed field never causes a `500`.

## Debugging Verification Failures

1. Log the byte length of the raw body and compare it with what `GET .../deliveries` shows.
2. Confirm the secret includes `whsec_` and was copied from the create/rotate response.
3. Make sure no middleware (JSON body parser, proxy re-encoding) touched the body.
4. Recompute locally: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$LEARNHOUSE_WEBHOOK_SECRET"`.
