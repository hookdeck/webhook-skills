# How to Verify Loop Returns Webhook Signatures

## How It Works

Each request has an `X-Loop-Signature` header. Compute `base64(HMAC-SHA256(secret, raw request body))` with the webhook secret from the Loop Admin (**Settings → Developer Tools**) and compare it to the header.

| Item | Value |
|------|-------|
| Header | `X-Loop-Signature` |
| Algorithm | HMAC-SHA256 |
| Encoding | Standard base64 (with `=` padding), not hex or base64url |
| Signed content | The raw request body, exactly as received |
| Key | The webhook secret, used as a plain string |
| Timestamp / replay check | None in the signature |

Loop provides no SDK for verification, so verify manually in every language.

## Implementation

### Manual Verification (Node.js)

```javascript
const crypto = require('crypto');

function verifyLoopSignature(rawBody, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // Different lengths = invalid
  }
}
```

### Manual Verification (Python)

```python
import base64, hashlib, hmac

def verify_loop_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    digest = hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(signature.encode(), expected.encode())
```

Complete handlers are in [examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and [examples/fastapi/](../examples/fastapi/).

## Common Gotchas

- **Use the raw body.** Parsing and re-serializing JSON changes whitespace and escaping (Loop's topic docs note that slashes are escaped in the JSON it signs, so your re-serialized copy may differ), so the HMAC no longer matches. Hash the bytes you received.
- **Accept any content type.** In Express use `express.raw({ type: '*/*' })`. A route that only reads `application/json` leaves `req.body` unparsed for other content types and verification fails.
- **Don't run `express.json()` first** on this route. Loop's own Express sample does both and relies on a `verify` hook to keep the buffer; `express.raw` alone is simpler.
- **Base64, not hex.** A hex digest never matches.
- **Compare timing-safely** and guard against length mismatch (`timingSafeEqual` throws on unequal lengths).
- **Use the right secret.** It is the webhook secret from Developer Tools, not an API key.
- **No timestamp to check.** The signature has no timestamp, so there is nothing to window on. Delivery is at least once, so dedupe instead.
- **Status codes matter.** Loop doesn't retry `400`, `401`, `403`, `404` or `422`, so a wrongly rejected delivery isn't redelivered.

## Debugging Verification Failures

1. Log `rawBody.length` and the first bytes; confirm they're a `Buffer`/`bytes`, not a parsed object.
2. Confirm the secret has no stray whitespace or quotes from `.env`.
3. Compute the HMAC locally from a captured request body (for example from the Hookdeck CLI web UI) and compare with the header.
4. If a proxy or framework middleware alters the body (gzip, charset conversion, trailing newline), move the verification to the first handler.
