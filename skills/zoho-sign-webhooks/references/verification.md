# Zoho Sign Signature Verification

## How Does Zoho Sign Sign Webhooks?

| Item | Value |
|------|-------|
| Header | `X-ZS-WEBHOOK-SIGNATURE` |
| Algorithm | HMAC-SHA256 |
| Key | The webhook secret key, as UTF-8 bytes (no decoding, no prefix) |
| Message | The raw request body |
| Encoding | Standard base64 |
| Timestamp | None signed. No replay window |
| SDK | None for verification. Use the manual code below |

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyZohoSign(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import base64, hashlib, hmac

def verify_zoho_sign(raw_body: bytes, signature: str, secret: str) -> bool:
    if not signature or not secret:
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64encode(digest), signature.encode())
```

## Common Gotchas

- **The docs say `HMAC SHA-256(payload+secret_key)`.** That is misleading. A plain HMAC of the
  payload keyed with the secret reproduces Zoho's published sample; appending the secret to
  the payload does not.
- **Published sample**: secret `thisisthesamplekeyfortestingpurposes` and a body that starts
  with `{{` give `drbSrM4H816RYKpZiRBLddUa0yHaTrwjtY04sIZFZus=`. The `{{` looks like a typo in
  the docs, but the signature only matches with it included, so it is a good test of byte-exact handling.
- **Use the raw body.** Re-serialising parsed JSON reorders or reformats keys and breaks the
  signature. In Express use `express.raw({ type: '*/*' })` so any content type is read as bytes.
- **HMAC is opt-in.** A webhook created without the checkbox sends no header. Reject requests
  without one if you expect signing.
- **The secret is write-only** in Zoho Sign. Save it when you create it.
- **No timestamp**, so signatures cannot be checked for age. Make handlers idempotent.
- **Use a timing-safe comparison**, and guard length mismatches (`timingSafeEqual` throws).

## How Do I Debug Verification Failures?

1. Log the raw body length and the header value. Is the header present at all?
2. Confirm HMAC is enabled on that webhook and the secret matches exactly (no trailing newline).
3. Confirm nothing parsed or re-encoded the body before verification (proxies, body parsers).
4. Compute `base64(HMAC-SHA256(secret, body))` by hand and compare.
