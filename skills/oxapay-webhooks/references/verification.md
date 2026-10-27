# OxaPay Signature Verification

## How It Works

OxaPay computes an HMAC-SHA512 over the **raw POST body** and sends it in the `HMAC` header as lowercase hex (128 characters, no prefix).

- Header: `HMAC`
- Algorithm: HMAC-SHA512, hex encoded
- Signed content: the raw request body bytes only (no timestamp, id or header)
- Key: the `MERCHANT_API_KEY` for payment callbacks, the `PAYOUT_API_KEY` for payout callbacks, used as UTF-8 bytes (not hex- or base64-decoded)

## Implementation

OxaPay has no SDK for this. Verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyOxapaySignature(rawBody, signature, secret) {   // rawBody: Buffer
  if (!signature || !secret || !/^[0-9a-fA-F]{128}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

### Python

```python
import hashlib, hmac, re

def verify_oxapay_signature(raw_body: bytes, signature, secret) -> bool:
    if not signature or not secret or not re.fullmatch(r"[0-9a-fA-F]{128}", signature):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha512).digest()
    return hmac.compare_digest(bytes.fromhex(signature), expected)
```

Full handlers: [Express](../examples/express/), [Next.js](../examples/nextjs/), [FastAPI](../examples/fastapi/).

## Common Gotchas

- **Raw body.** Verify the bytes as received. Re-serialising parsed JSON changes spacing and key order and breaks the match. Express: `express.raw({ type: '*/*' })`.
- **Two keys.** A payout callback verified with the merchant key (or the reverse) fails. OxaPay's own samples choose the key from `data.type`; the Node and Python samples test `type === 'payment'`, a value payments never carry (they are `invoice` etc.), so as written they pick the payout key for payments. Use one secret per deployment, or choose by `type` yourself after verifying with each candidate.
- **Validate the format first.** `Buffer.from(sig, 'hex')` silently drops invalid characters, so check for exactly 128 hex characters before decoding. Compare in constant time, not with `===`.
- **Case.** Hex is compared case-insensitively; decode (or lowercase) both sides.
- **No timestamp.** Nothing signed carries a time, so there is no replay window to check; de-duplicate on `track_id` + `status` instead.
- **Reply `ok`.** A verified callback must get HTTP 200 with the body `ok`, or OxaPay retries.

## Debugging Verification Failures

- **401 on every payment:** wrong key (a payout key used for payment callbacks, or vice versa), or extra whitespace in the env var.
- **Works with curl, fails live:** a framework parsed the body before verification; read the raw bytes.
- **Signature fine but OxaPay retries:** the response was not 200 with body `ok` (for example JSON `{"received":true}`).
- **Behind Hookdeck:** the source verifies one key, so use a separate source per key and set the source's custom response to `ok`.
