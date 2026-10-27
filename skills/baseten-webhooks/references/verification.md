# How to Verify Baseten Webhook Signatures

## How It Works

When a webhook secret is configured, Baseten adds `X-BASETEN-SIGNATURE: v1=<hex>` to each delivery.

- Algorithm: HMAC-SHA256
- Key: the webhook secret as UTF-8 bytes, used as-is
- Signed message: the **raw request body bytes** only. No timestamp, id or header is included
- Encoding: lowercase hex, prefixed `v1=`
- Hookdeck's Baseten source uses the same scheme (header `x-baseten-signature`, sha256, hex) and also accepts the bare digest

Baseten's own sample compares the value after `v1=`, cut at the first comma. That suggests several comma-separated values can appear, for example during the 24-hour rotation overlap. The docs don't spell this out, so accept if any entry matches.

There is no timestamp, so there is no replay window to enforce. Don't invent one from unsigned headers or body fields; use `request_id` for idempotency instead.

## Implementation

Baseten has no webhook verification SDK, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, header, secret) {
  if (!header || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return header.split(',').some((part) => {
    const sig = part.trim().replace(/^v1=/, '');
    if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected);
  });
}
```

### Python

```python
import hashlib, hmac, re

def verify(raw_body: bytes, header: str, secret: str) -> bool:
    if not header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    for part in header.split(","):
        sig = part.strip().removeprefix("v1=")
        if re.fullmatch(r"[0-9a-fA-F]{64}", sig) and hmac.compare_digest(bytes.fromhex(sig), expected):
            return True
    return False
```

The hex is checked (exactly 64 characters, hex alphabet) before decoding, because `Buffer.from(sig, 'hex')` silently drops invalid characters. Both sides are compared as bytes, which also makes the compare case-insensitive.

## Common Gotchas

- **Use the raw body.** Parsing and re-serializing JSON changes whitespace and key order and breaks the HMAC. Express: `express.raw({ type: '*/*' })`; Next.js: `await request.arrayBuffer()`; FastAPI: `await request.body()`.
- **Strip `v1=`.** The header value is not the bare digest.
- **Unsigned deliveries.** With no secret configured, Baseten sends no signature header. Reject missing headers rather than skipping verification.
- **Don't decode the secret.** Use its UTF-8 bytes.
- **Responses.** Return `401` for a missing, malformed or wrong signature. Baseten retries only `500`/`502`/`503`/`504`, so `401` is final and `500` triggers the single retry.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always `401` | Wrong secret, or body parsed before verifying |
| Works locally, fails behind a proxy | Proxy rewrites or re-encodes the body |
| Header missing | No webhook secret configured in Baseten |
| Fails only during rotation | Header holds several values; check each one |
