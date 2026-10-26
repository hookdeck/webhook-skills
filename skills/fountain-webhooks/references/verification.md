# How to Verify Fountain Webhook Signatures

## How Does Fountain Sign Webhooks?

Fountain's docs: every payload is signed with a signature passed in the `X-OBIQ-SIGNATURE-V2` header. The
signature is hex encoded and is HMAC-SHA-256 of the webhook's request body, using your Fountain Hire private
API token as the secret.

| Item | Value |
|------|-------|
| Header | `X-OBIQ-SIGNATURE-V2` |
| Algorithm | HMAC-SHA256 |
| Encoding | Hex (64 characters), bare digest with no prefix |
| Signed message | The raw request body bytes only |
| Key | Fountain Hire private API token, UTF-8 bytes, used as-is |
| Timestamp / replay window | None (nothing but the body is signed) |

Fountain's own Ruby example: `OpenSSL::HMAC.hexdigest(OpenSSL::Digest::SHA256.new, YOUR_API_TOKEN, body)`.

Paste your Fountain Hire private API token. Only the default body signing is supported: accounts switched to applicant ID signing fail verification.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyFountainSignature(rawBody, signatureHeader, secret) {
  if (!secret || !Buffer.isBuffer(rawBody)) return false;
  if (typeof signatureHeader !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), expected);
}
```

### Python

```python
import hashlib, hmac, re

def verify_fountain_signature(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not isinstance(signature_header, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", signature_header):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature_header), expected)
```

Complete handlers with tests: [Express](../examples/express/), [Next.js](../examples/nextjs/), [FastAPI](../examples/fastapi/).

## Common Gotchas

- **Raw body.** Sign and verify the bytes exactly as received. Do not `JSON.parse` / `JSON.stringify` first.
  In Express use `express.raw({ type: '*/*' })`; in Next.js `await request.arrayBuffer()`; in FastAPI
  `await request.body()`.
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops invalid characters, so check for
  exactly 64 hex characters first. Hex is case-insensitive.
- **Constant-time compare on bytes** (`crypto.timingSafeEqual` on equal-length buffers, `hmac.compare_digest`
  on bytes, never `str`).
- **The key is the API token.** There is no separate webhook secret. Rotating the token changes the key.
- **Do not decode the token.** Use its UTF-8 bytes, even if it looks like hex or base64.
- **No replay protection.** Nothing but the body is signed. Do not invent a timestamp check from unsigned
  headers or body fields; dedupe on your own keys (for example applicant or worker id plus stage) if needed.
- **Applicant ID signing is not supported.** Fountain Admin Tools can switch an account to sign the applicant
  ID instead of the body. Those signatures fail here, as they do in Hookdeck's Fountain source.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `401` on every request | Wrong token in `FOUNTAIN_WEBHOOK_SECRET`, or the token was rotated |
| `401` only in production | A proxy or framework re-serialised the body; verify the raw bytes |
| `401` and the header is a different length | Header is not a bare 64-hex digest (prefix, whitespace, duplicated header) |
| Fails for one account only | Account was switched to applicant ID signing; ask Fountain to switch back |
| `401` for a missing header | The request did not come from Fountain Hire (or a gateway stripped the header) |
