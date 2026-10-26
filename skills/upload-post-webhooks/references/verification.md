# Upload-Post Signature Verification

## How Does Upload-Post Sign Webhooks?

| Item | Value |
|------|-------|
| Signature header | `X-Upload-Post-Signature: sha256=<hex>` (sent whenever the account has a `webhook_secret`) |
| Timestamp header | `X-Upload-Post-Timestamp`, Unix time in seconds when the request was signed |
| Delivery header | `X-Upload-Post-Delivery`, a unique id per delivery (not signed), useful for logging and tracing |
| Event header | `X-Upload-Post-Event`, the event name (not signed) |
| Algorithm | HMAC-SHA256, lowercase hex |
| Signed content | `<timestamp>.<raw body>` (timestamp header value, a literal `.`, the raw body bytes) |
| Key | The webhook secret's UTF-8 bytes, whole, including `whsec_` |

This is **not** Standard Webhooks: there is no `webhook-id`, nothing is base64-decoded and the digest is hex. Do not use the `standardwebhooks` or `svix` libraries.

> Paste the whole secret, including the whsec_ prefix. Upload-Post uses it as a plain HMAC key.

## Implementation

There is no Upload-Post SDK verification helper, so verify manually. Build the signed message as bytes, the way Hookdeck's template does: the timestamp header string encoded latin1 (never trimmed or reformatted), a `.`, then the body bytes exactly as received.

Node (Express with `express.raw({ type: '*/*' })`, Next.js with `Buffer.from(await request.arrayBuffer())`):

```javascript
const crypto = require('crypto');

function verify(rawBody, signature, timestamp, secret) {
  if (!signature || !timestamp || !secret) return false;
  const hex = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return false;
  const signed = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(signed).digest();
  const received = Buffer.from(hex.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

Python (FastAPI with `await request.body()`):

```python
import hashlib, hmac, re

def verify(raw_body: bytes, signature: str, timestamp: str, secret: str) -> bool:
    if not signature or not timestamp or not secret:
        return False
    digest = signature[7:] if signature.startswith("sha256=") else signature
    if not re.fullmatch(r"[0-9a-fA-F]{64}", digest):
        return False
    signed = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(digest.lower()), expected)
```

Respond `401` for a missing or empty header, a malformed value or a mismatch.

## Should I Reject Old Timestamps?

Not by default. Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck applies no tolerance, so a fixed window would reject legitimate retries. If you receive deliveries directly and want replay protection, set `UPLOAD_POST_WEBHOOK_TOLERANCE_SECONDS` (unset or `0` = off); Upload-Post's own samples reject timestamps more than 300 seconds old, so `300` matches them. The examples then reject deliveries whose `X-Upload-Post-Timestamp` (Unix seconds) differs from now by more than that. Idempotency on the event is the other defence.

## Common Gotchas

- **Raw body:** verify the bytes as received. Never `JSON.parse`/`JSON.stringify` first, and never decode the body to a string and re-encode it.
- **Whole secret:** keep the `whsec_` prefix; the key is not base64-decoded.
- **Prefix:** the header value starts with `sha256=`. Strip it before validating the 64-hex digest (a bare digest is also accepted).
- **Hex case:** compare case-insensitively; lowercase both sides.
- **Validate before decoding:** `Buffer.from(sig, 'hex')` silently drops bad characters, so check length and alphabet first.
- **Constant time:** `crypto.timingSafeEqual` on equal-length Buffers; `hmac.compare_digest` on bytes.
- **No secret, no signature:** deliveries made before a secret existed have no signature header and fail.

## Debugging Verification Failures

1. Print the exact `X-Upload-Post-Timestamp` and compare it with the value you sign (no trimming).
2. Confirm the env var is the full secret, `whsec_` included, with no quotes or trailing newline.
3. Confirm the framework gives you raw bytes, not parsed JSON.
4. Recompute with the same bytes in a script and compare hex digests.
