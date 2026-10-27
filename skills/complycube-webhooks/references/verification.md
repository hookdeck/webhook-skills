# How to Verify ComplyCube Webhook Signatures

## How It Works

- Header: `ComplyCube-Signature`, value is the bare hex digest (no `sha256=` prefix)
- Algorithm: HMAC-SHA256, hex encoded
- Key: the webhook's secret, as UTF-8 bytes (not hex- or base64-decoded)
- Message: the **raw request body bytes** only. No timestamp, id or other header is signed, so there
  is no replay window to check
- Not Standard Webhooks. ComplyCube's docs do not name the encoding; the official Node SDK
  (`@complycube/api` `EventVerifier`) decodes the header as hex and compares with `timingSafeEqual`

The examples verify manually so they work on the exact bytes in Node, Next.js and Python. ComplyCube
also ships official `EventVerifier` helpers (Node.js, Python, PHP, .NET) that take the payload, the
header and the secret.

## Implementation

Node:

```javascript
const crypto = require('crypto');

function verifyComplyCubeSignature(rawBody, signatureHeader, secret) {
  if (typeof signatureHeader !== 'string' || !/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), expected);
}
```

Python:

```python
import hashlib, hmac, re

def verify_complycube_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    if not signature_header or not re.fullmatch(r"[0-9a-fA-F]{64}", signature_header):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest().encode("ascii")
    return hmac.compare_digest(signature_header.lower().encode("ascii"), expected)
```

## Common Gotchas

- **Raw body, not `JSON.stringify(req.body)`.** ComplyCube's Node sample re-serialises the parsed body.
  That only matches when ComplyCube's JSON is compact with the same key order. Verify the bytes you received.
- **Any content type.** In Express use `express.raw({ type: '*/*' })`; in Next.js read `request.arrayBuffer()`;
  in FastAPI read `await request.body()`. Parse the JSON only after the check.
- **No prefix, no list.** Compare the whole header value as one digest.
- **Validate hex before decoding in Node.** `Buffer.from(x, 'hex')` stops at the first invalid character,
  so check `/^[0-9a-f]{64}$/i` first. Hex is case-insensitive.
- **Compare bytes in Python.** `hmac.compare_digest` on `str` raises `TypeError` for non-ASCII input; encode both sides.
- **The secret is shown once.** If you lost it, create a new webhook; there is no way to read it again.
- **Respond 401** for a missing, malformed or mismatched signature.

## Debugging Verification Failures

1. Header missing: the request did not come from ComplyCube, or a proxy stripped it.
2. Mismatch: confirm you are using the secret of *this* webhook endpoint (each endpoint has its own).
3. Mismatch only on some payloads: a body parser or middleware changed the bytes. Read the raw body.
4. Hookdeck in front: paste the same secret into the Hookdeck source verification settings.
