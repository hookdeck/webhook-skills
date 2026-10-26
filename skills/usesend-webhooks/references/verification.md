# useSend Signature Verification

## How It Works

useSend sends two headers:

| Header | Value |
|--------|-------|
| `X-UseSend-Signature` | `v1=<hex>`, lowercase hex HMAC-SHA256 |
| `X-UseSend-Timestamp` | Unix timestamp in **milliseconds** |

The signed message is the timestamp header value, a literal `.`, then the raw
request body bytes:

```
HMAC-SHA256(secret, "${timestamp}.${rawBody}")
```

The key is the secret's UTF-8 bytes, used whole including the `whsec_` prefix. It
is not base64- or hex-decoded. **This is not Standard Webhooks**, so do not use
the `standardwebhooks` or `svix` libraries.

## Implementation

Build the message as bytes, the way Hookdeck does: separators as UTF-8, the
timestamp header as its exact string encoded latin1, and the body bytes as
received. Never decode the body and re-encode it, and never `JSON.parse` before
verifying.

### Node.js

```javascript
const crypto = require('crypto');

function verifyUseSend(rawBody, signature, timestamp, secret) {
  if (!signature || !timestamp || !secret) return false;
  const hex = (signature.startsWith('v1=') ? signature.slice(3) : signature).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) return false;
  const message = Buffer.concat([
    Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody,
  ]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(hex, 'hex'));
}
```

### Python

```python
import hashlib, hmac, re

def verify_usesend(raw_body: bytes, signature: str, timestamp: str, secret: str) -> bool:
    if not signature or not timestamp or not secret:
        return False
    digest = (signature[3:] if signature.startswith("v1=") else signature).lower()
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        return False
    message = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    return hmac.compare_digest(expected, bytes.fromhex(digest))
```

Hex is compared case-insensitively, as Hookdeck does. The leading `v1=` is
optional: a bare 64-character digest is accepted too.

## Why the Examples Don't Use usesend-js

The `usesend-js` SDK (`webhooks.constructEvent` / `webhooks.verify`) rejects
signatures older than 5 minutes by default. Hookdeck retries and replays resend
the original headers and timestamp, and Hookdeck applies no tolerance of its
own, so that window would reject legitimate retries. The examples verify by hand
and make the window opt-in.

## Timestamp Tolerance (opt-in)

Set `USESEND_WEBHOOK_TOLERANCE_SECONDS` to a positive number to reject requests
whose `X-UseSend-Timestamp` is further than that many seconds from now. Unset or
`0` means off, which is the default. The header is in **milliseconds**, so
compare against `Date.now()`, not seconds.

## Common Gotchas

- **Use the raw body.** `express.raw({ type: '*/*' })`, Next.js
  `await request.arrayBuffer()`, FastAPI `await request.body()`. Parsing and
  re-serialising changes the bytes.
- **Keep the whole secret.** Paste the whole secret, including the whsec_ prefix.
  useSend uses it as a plain HMAC key.
- **Milliseconds, not seconds.** Only matters if you add a tolerance check.
- **Don't trim or reformat the timestamp header.** Sign the exact string.
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops bad
  characters, so check the length (64) and alphabet first.
- **Compare in constant time** on bytes of equal length (`timingSafeEqual`,
  `hmac.compare_digest`).

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong secret, `whsec_` stripped, or the secret was base64-decoded |
| Fails only for some bodies | Body was parsed or re-serialised before verifying |
| Fails after adding tolerance | Timestamp compared in seconds instead of milliseconds |
| `401` on `webhook.test` | Same checks apply to the test event; check the secret |
| Missing headers | A proxy stripped `X-UseSend-*` headers |
