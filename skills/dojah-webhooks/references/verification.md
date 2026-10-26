# How to Verify Dojah Webhook Signatures

## How It Works

Every Dojah delivery carries `x-dojah-signature`: the lowercase hex HMAC-SHA256 of the event payload, signed
with the **webhook secret** for that subscription.

```
x-dojah-signature: 63e0b2c79e8b73993777ce312d6b3ad421742d9a8f2657a3e3c14909c6578ab6
```

- Signed content: the **raw request body** only (no timestamp, id or other header)
- Key: the webhook secret as UTF-8 bytes (not hex or base64 decoded)
- Encoding: bare lowercase hex, 64 characters, no prefix; compare the whole header value
- Dojah does not sign a timestamp, so there is no replay window; make handlers idempotent

Paste the webhook secret from Developers > Webhooks, not your API secret key.

Deliveries also carry `x-dojah-signature-v2`, a SHA256 hash of your secret key alone with no payload. It proves
nothing about the body; verify only `x-dojah-signature`. Dojah also documents allowlisting its sender IP
(`135.119.89.106`) as an additional check.

## Implementation

Dojah has no verification SDK, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyDojahSignature(rawBody, signatureHeader, secret) {
  if (!secret || typeof signatureHeader !== 'string') return false;
  // Validate before decoding: Buffer.from(x, 'hex') silently drops bad characters
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signatureHeader, 'hex'));
}
```

### Python

```python
import hashlib, hmac, re

def verify_dojah_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not secret or not re.fullmatch(r"[0-9a-fA-F]{64}", signature_header or ""):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest().encode()
    return hmac.compare_digest(expected, signature_header.lower().encode())
```

Reject a missing, empty or malformed header and any mismatch with `401`.

## Common Gotchas

- **Use the raw body.** Re-serialising JSON can reorder keys or change spacing. In Express use
  `express.raw({ type: '*/*' })`; in Next.js use `await request.arrayBuffer()`; in FastAPI use `await request.body()`.
- **Webhook secret, not API secret key.** The API secret key will never match `x-dojah-signature`.
- **Each subscription has its own secret**, and Live and Sandbox differ.
- **Don't decode invalid hex.** `Buffer.from('zz...', 'hex')` truncates instead of throwing; check the 64-hex format first.
- **Compare bytes in Python.** `hmac.compare_digest` raises `TypeError` on non-ASCII `str`, turning a bad header into a 500.
- **Treat parsed fields as untrusted.** After verifying, check types before reading into the body.

## Debugging Verification Failures

1. Confirm `DOJAH_WEBHOOK_SECRET` is the value in the **Secret** column for this subscription (no trailing whitespace).
2. Print the raw body length and compare with `Content-Length`.
3. Confirm no middleware parses the body before your handler.
4. Recompute locally: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET"`.
5. Check that a proxy or tunnel isn't altering the body.
