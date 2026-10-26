# How to Verify Freemius Webhook Signatures

## How Does Freemius Sign Webhooks?

Freemius includes a signature in the `x-signature` header of each request. The documented steps:

1. Read the `x-signature` header.
2. Read the raw request body.
3. Compute the HMAC-SHA256 of the raw body using your product's secret key.
4. Compare the computed hash with the header.

Details this skill relies on:

| Item | Value |
|------|-------|
| Header | `x-signature` |
| Algorithm | HMAC-SHA256 |
| Encoding | Lowercase hex, 64 characters, bare value (no `sha256=` prefix) |
| Signed content | The raw body bytes only. No timestamp, id or other header is signed |
| Key | The product's secret key, as UTF-8 bytes (not hex- or base64-decoded) |

Hookdeck's Freemius source uses the same configuration (HMAC, `sha256`, header `x-signature`, hex), so the same handler works whether Freemius delivers directly or through Hookdeck.

## Implementation

Freemius documents manual verification in Node.js and PHP and does not offer a verification SDK for this, so every example verifies manually.

### Node.js (Express)

```javascript
const crypto = require('crypto');

function verifyFreemiusSignature(rawBody, signature, secret) {
  if (typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Raw bytes for any content type; parse only after verifying
app.post('/webhooks/freemius', express.raw({ type: '*/*' }), (req, res) => { /* ... */ });
```

### Next.js (App Router)

```typescript
const rawBody = Buffer.from(await request.arrayBuffer()); // not request.json()
verifyFreemiusSignature(rawBody, request.headers.get('x-signature'), secret);
```

### Python (FastAPI)

```python
import hashlib, hmac, re

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")

def verify_freemius_signature(raw_body: bytes, signature: str | None, secret: str) -> bool:
    if not signature or not HEX_SHA256.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest().encode()
    return hmac.compare_digest(expected, signature.lower().encode())  # bytes, never str

raw_body = await request.body()  # not await request.json()
```

## Common Gotchas

- **Use the raw body.** Don't `JSON.parse` and `JSON.stringify` before verifying; whitespace and key order change the digest. Keep it as bytes and never decode and re-encode it.
- **Read the body for any content type.** `express.raw({ type: '*/*' })` avoids a content-type mismatch leaving `req.body` empty or parsed.
- **Use the product secret key.** It lives under **Settings > API & Keys**, one per product. It is not a per-webhook secret.
- **Validate the header before decoding it.** `Buffer.from(x, 'hex')` silently drops invalid characters; check for exactly 64 hex characters, then compare in constant time. Hex is compared case-insensitively, so lowercase before decoding.
- **There is no timestamp.** Nothing but the body is signed, so there is no replay window to enforce. Don't invent one from unsigned headers or body fields. Make handlers idempotent instead.
- **Status codes.** A missing, empty, malformed or wrong signature is `401`; a signed but unusable body (bad JSON, not an object, no string `type`) is `400`; a missing server secret is `500`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request returns 401 | Wrong secret (it must be the product secret key from **Settings > API & Keys**), or the secret has stray whitespace |
| Only some requests fail | The body is being parsed and re-serialised before verifying, or a proxy rewrites it |
| 401 with a valid-looking header | The header is not 64 hex characters (a prefix such as `sha256=` was added, or it was truncated) |
| Works in tests, fails live | Test signs a different string than the bytes Freemius sent (check non-ASCII characters and line endings) |
| 401 for every event from one product | The webhook belongs to a different product than the key you configured |
