# How to Verify RocketReach Webhook Signatures

## How It Works

Once you generate a secret, RocketReach adds `X-RocketReach-Signature` to every delivery:

```
X-RocketReach-Signature: h50yogIFeOJuOvaxOoJhtJ2WHOzqdKFsGG7p4f3lkwI=
```

The value is `base64(HMAC-SHA256(key = secret as UTF-8, message = raw response body))`.
No timestamp is signed, so there is no tolerance window. There is no SDK; verify manually.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyRocketReachSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signatureHeader);
  return expectedBuf.length === receivedBuf.length && crypto.timingSafeEqual(expectedBuf, receivedBuf);
}
```

Compare the two base64 strings as equal-length UTF-8 Buffers after a length check. Don't decode
the header with `Buffer.from(header, 'base64')`: that decoder is lenient and accepts junk.

### Python

```python
import base64, hashlib, hmac

def verify_rocketreach_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest)
    return hmac.compare_digest(expected, signature_header.encode("utf-8"))
```

Encode both sides to bytes: `compare_digest` raises `TypeError` for a non-ASCII `str`, which
would turn a bad header into a 500 instead of a 401.

## Common Gotchas

- **Raw body**: sign the exact bytes received. In Express use `express.raw({ type: '*/*' })`, in
  Next.js `request.text()`, in FastAPI `await request.body()`.
- **Secret is generated, not optional in practice**: with no secret, deliveries have no signature
  header and verification fails.
- **Regenerating the secret:** RocketReach documents no overlap period for the old secret, so assume deliveries are signed with the new one straight away and update your config promptly.
- **Bulk lookups** deliver a JSON list; the signature covers the whole body.
- **Use the secret as UTF-8 text**, not base64-decoded bytes.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| No signature header | No secret generated for that webhook |
| Always mismatches | Body parsed and re-serialised, or wrong/old secret |
| Mismatch only on some content types | Body parser skipped the raw route; use `type: '*/*'` |
| 500 in Python on a bad header | `compare_digest` called with a non-ASCII `str` |
