# How to Verify Taskade Webhook Signatures

> Only webhooks registered through the Taskade public API (Pro plan and above) are supported. Legacy webhooks are unsigned and fail verification.

## How It Works

Every delivery carries three headers:

| Header | Value |
|--------|-------|
| `X-Taskade-Timestamp` | Send time, in unix seconds |
| `X-Taskade-Signature-V2` | `sha256=` + hex HMAC-SHA256 of `<timestamp>.<raw body>` |
| `X-Taskade-Signature` | `sha256=` + hex HMAC-SHA256 of the raw body alone |

The key is the `secret` returned at registration. Taskade tells new receivers to check `X-Taskade-Signature-V2`:

1. Read the raw request body before you parse the JSON.
2. Compute the HMAC-SHA256 of the `X-Taskade-Timestamp` value, a period, and the raw body.
3. Compare `sha256=<your hex>` with `X-Taskade-Signature-V2` in constant time.
4. Reject the delivery if the timestamp is more than 5 minutes from your clock.
5. Make the handler idempotent, or record each delivery and skip a repeat: a copy that arrives inside the 5 minutes still passes.

`X-Taskade-Signature` still works, but with no timestamp signed it doesn't stop a replay.

## Implementation

Taskade documents no webhook SDK; verify manually. Validate the format (exactly 64 hex characters) before decoding, then compare in constant time.

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, timestampHeader, secret) {
  if (!signatureHeader || !secret || !/^\d+$/.test(timestampHeader || '')) return false;
  const sig = signatureHeader.trim().replace(/^sha256=/i, '');
  if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(`${timestampHeader}.`).update(rawBody).digest();
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected)) return false;
  return Math.abs(Date.now() / 1000 - Number(timestampHeader)) <= 300;
}
```

### Python

```python
import hashlib, hmac, re, time

def verify(raw_body: bytes, signature_header: str, timestamp_header: str, secret: str) -> bool:
    if not signature_header or not secret or not re.fullmatch(r"[0-9]+", timestamp_header or ""):
        return False
    sig = re.sub(r"^sha256=", "", signature_header.strip(), flags=re.I)
    if not re.fullmatch(r"[0-9a-fA-F]{64}", sig):
        return False
    signed = timestamp_header.encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).digest()
    if not hmac.compare_digest(bytes.fromhex(sig), expected):
        return False
    return abs(time.time() - int(timestamp_header)) <= 300
```

## Common Gotchas

- **Use the raw bytes.** Never `JSON.parse`/`JSON.stringify` before verifying, and don't decode to a string and re-encode. Express: `express.raw({ type: '*/*' })`; Next.js: `await request.arrayBuffer()`; FastAPI: `await request.body()`.
- **Sign the timestamp too.** V2 covers `<timestamp>.<body>`; an HMAC of the body alone matches the older `X-Taskade-Signature`, not V2.
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops bad characters, so check the 64-hex format first. `timingSafeEqual` throws on unequal lengths.
- **Compare bytes, not str, in Python.** `hmac.compare_digest` on `str` raises for non-ASCII input.
- **The secret is shown once.** Lost secret means a new registration.
- **Legacy subscriptions are unsigned** and fail verification.
- **Respond `401`** for a missing, malformed, mismatched or stale signature.

## Debugging Verification Failures

1. Header missing: the subscription is a legacy one, or a proxy stripped the header.
2. Mismatch: confirm `TASKADE_WEBHOOK_SECRET` equals the registration `secret` exactly (no quotes or trailing newline), and that you prefixed the timestamp and a period.
3. Mismatch on some requests only: a body parser touched the bytes before verification.
4. Rejected as stale: your server clock is off, or the delivery was held or replayed for more than 5 minutes before it reached your handler.
