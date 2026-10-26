# How to Verify CharityStack Webhook Signatures

## How Does CharityStack Sign Webhooks?

Each delivery has:

| Header | Value |
|--------|-------|
| `X-Webhook-Signature` | `sha256=<hex_digest>` |
| `X-Webhook-Timestamp` | Unix timestamp (seconds) of when the request was signed |
| `X-Webhook-ID` | Unique identifier for this delivery attempt |

```
signed_string = timestamp + "." + raw_body
signature     = "sha256=" + hex(HMAC_SHA256(secret, signed_string))
```

- Key: the webhook `secret` from the create-webhook response, used as its UTF-8 bytes, as-is.
- Message: the exact `X-Webhook-Timestamp` header string, a literal `.`, then the raw request body bytes.
- Digest: lowercase hex. Compare hex case-insensitively and accept it with or without the `sha256=` prefix (Hookdeck's parser accepts both).

CharityStack has no webhook SDK; verify manually.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signature, timestamp, secret) {
  if (!signature || !timestamp) return false;
  const digest = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  if (!/^[0-9a-fA-F]{64}$/.test(digest)) return false;

  const signed = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signed).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(digest.toLowerCase(), 'hex'));
}
```

### Python

```python
import hashlib, hmac, re

def verify(raw_body: bytes, signature: str, timestamp: str, secret: str) -> bool:
    if not signature or not timestamp:
        return False
    digest = signature.removeprefix("sha256=")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", digest):
        return False
    signed = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
    return hmac.compare_digest(expected, bytes.fromhex(digest))
```

Complete handlers with tests: [Express](../examples/express/), [Next.js](../examples/nextjs/), [FastAPI](../examples/fastapi/).

## Should I Check the Timestamp?

CharityStack's guide recommends rejecting timestamps more than 5 minutes from your clock. These examples leave it **off by default**: Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck itself applies no tolerance, so a fixed window rejects legitimate retries. Opt in with `CHARITYSTACK_WEBHOOK_TOLERANCE_SECONDS` (unset or `0` = off). The timestamp is inside the signed content, so it can't be refreshed on a replay.

## Common Gotchas

- **Raw body**: any parsing and re-serialising changes the bytes. Express: `express.raw({ type: '*/*' })`; Next.js: `await request.arrayBuffer()`; FastAPI: `await request.body()`.
- **Bytes, not strings**: don't decode the body to text and re-encode it. Concatenate bytes.
- **Secret encoding**: the secret is used as UTF-8 text, not hex- or base64-decoded.
- **Validate before decoding**: `Buffer.from(sig, 'hex')` silently drops bad characters. Check for exactly 64 hex characters first.
- **Length mismatch**: `crypto.timingSafeEqual` throws on unequal lengths, so decode a validated digest to 32 bytes first.
- **Python**: `hmac.compare_digest` on bytes, not `str`.
- **Secret shown once**: a lost secret means deleting and recreating the webhook.
- **Status codes**: missing or empty headers, malformed value, or mismatch all return `401`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always `Invalid signature` | Wrong secret (copy the one from the create response), or the body was parsed first |
| Fails only on non-ASCII payloads | Body decoded to a string and re-encoded |
| Fails only behind a proxy | Proxy rewrote the body, or stripped `X-Webhook-Timestamp` |
| `Missing X-Webhook-Timestamp` | Header dropped by a proxy or framework; both headers are required |
| Old events rejected | `CHARITYSTACK_WEBHOOK_TOLERANCE_SECONDS` is set; unset it to accept replays |
