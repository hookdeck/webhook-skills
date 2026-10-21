# How to Verify Signal Sciences Webhook Signatures

## How Does the Signature Work?

Fastly's docs: every request from the generic webhook integration contains an `X-SigSci-Signature` header whose value is an HMAC-SHA256 hex digest, hashed using the signing key generated when the integration was created. Verification means computing the HMAC-SHA256 hex digest of the webhook payload with that key and comparing it to the header.

| Item | Value |
|------|-------|
| Header | `X-SigSci-Signature` |
| Algorithm | HMAC-SHA256 |
| Encoding | Hex |
| Signed content | The raw JSON request body, byte for byte |
| Key | The integration's signing key, as a raw string |
| Timestamp | None. No replay window is provided |

## Implementation

Fastly has no verification SDK, so use the manual check. Node:

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, signingKey) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', signingKey).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader.trim().toLowerCase()), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

Python:

```python
import hmac, hashlib

def verify(raw_body: bytes, signature_header: str, signing_key: str) -> bool:
    if not signature_header:
        return False
    expected = hmac.new(signing_key.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.strip().lower(), expected)
```

## Common Gotchas

- **Use the raw body.** Parsing and re-serializing JSON changes bytes. In Express use `express.raw({ type: '*/*' })`; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Key is a raw string.** Don't base64-decode it or strip a prefix.
- **No prefix on the header.** The value is bare hex, not `sha256=...`.
- **No timestamp.** Replays can't be rejected by age, so make handlers idempotent (see webhook-handler-patterns).
- **Rotation.** After clicking **Rotate**, new deliveries use the new key. Update your secret at the same time.
- **Event name is in the body.** Read `type` from the parsed JSON, after verification.

## Debugging Verification Failures

1. Print the length of the raw body and compare with what Fastly sent (via the Hookdeck CLI request view).
2. Confirm you're using the key for *this* integration. Each alert or site integration has its own key.
3. Make sure no middleware (body parsers, proxies) alters the body before verification.
4. Test with Fastly's published example by hand: `echo -n "$BODY" | openssl dgst -sha256 -hmac "$KEY"` and compare with the header.
