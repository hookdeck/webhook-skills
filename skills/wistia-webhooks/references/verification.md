# How to Verify Wistia Webhook Signatures

## How It Works

Wistia sends the `X-Wistia-Signature` header with each delivery. Its value is the lowercase hex digest of an **HMAC-SHA256** over the **raw POST body**, keyed with the **Secret Key** you entered when configuring the webhook. Wistia's reference sample (Ruby):

```ruby
payload_body = request.body.read
signature = OpenSSL::HMAC.hexdigest(OpenSSL::Digest.new('sha256'), secret_key, payload_body)
```

- Header: `X-Wistia-Signature` (bare 64-character hex digest, no `sha256=` prefix)
- Signed content: the raw body bytes only. No timestamp, id or other header is signed
- Key: the secret's UTF-8 bytes, used as-is (not hex- or base64-decoded)
- Compare the **whole** header value as one digest

Wistia has no webhook SDK, so verify manually.

## Implementation

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

function verifyWistiaSignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string' || !HEX_SHA256.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // validated above
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

### Python (FastAPI)

```python
import hashlib, hmac, re

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")

def verify_wistia_signature(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    if not secret or not signature or not HEX_SHA256.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature), expected)
```

## Common Gotchas

- **Use the raw body bytes.** Never decode to a string and re-encode, and never `JSON.parse`/`JSON.stringify` before verifying. In Express use `express.raw({ type: '*/*' })`; in Next.js `await request.arrayBuffer()`; in FastAPI `await request.body()`.
- **Validate the header before decoding it.** Require exactly 64 hex characters. `Buffer.from(sig, 'hex')` silently drops invalid characters, so only call it after the format check, and use `hmac.compare_digest` on bytes (never `str`) in Python.
- **Hex case.** Compare case-insensitively: lowercase the header (or decode both to bytes) before the constant-time compare.
- **The secret is yours.** It is whatever you typed into the Secret Key field in Wistia, so a mismatch usually means a stale value in your environment.
- **No timestamp, no replay window.** Nothing time-based is signed, so there is no tolerance to check. Use the event `uuid` to ignore duplicates.
- **Batched deliveries.** The signature covers the whole body, which can contain several events. Verify once, then loop over `events`.
- **Status codes.** Respond `401` for a missing, malformed or mismatched signature, `400` for a correctly signed body that is not the expected JSON, and `200` once accepted.

## Debugging Verification Failures

1. Confirm `WISTIA_WEBHOOK_SECRET` equals the Secret Key saved on that webhook in Wistia (each webhook has its own).
2. Log the length of the raw body and compare it with the `Content-Length` header; a difference means a middleware changed the body.
3. Check that no JSON body parser runs before your handler on this route.
4. Make sure a proxy or framework is not re-encoding the body or changing header values.
