# How to Verify Infinite Giving Webhook Signatures

## How Does the Signature Work?

Infinite Giving sends:

- `X-IG-Timestamp`: Unix timestamp (seconds) used in the signature
- `X-IG-Signature`: `sha256=<hex>`, an HMAC-SHA256 signature

The signature is the lowercase hex HMAC-SHA256, keyed with your signing secret, over:

```
{X-IG-Timestamp value} + "." + {raw request body bytes}
```

Per the docs: "Compute HMAC-SHA256 of `${timestamp}.${rawBody}` with your signing secret (from kickoff). Compare to X-IG-Signature (sha256= + hex digest)."

Infinite Giving provides no official verification SDK, so the examples use manual verification with the standard library.

## How Do I Implement It?

Build the signed message as bytes:

1. Literal separator `.` as UTF-8.
2. `X-IG-Timestamp` exactly as received, encoded latin1 (never trimmed or reformatted).
3. The raw body bytes as received.
4. The key is the secret's UTF-8 bytes (not hex- or base64-decoded).

Then validate the header before decoding: strip an optional leading `sha256=`, lowercase, and require exactly 64 hex characters. Compare in constant time.

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, timestamp, signature, secret) { // rawBody: Buffer
  if (!timestamp || !signature || !secret) return false;
  const hex = signature.replace(/^sha256=/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody]))
    .digest();
  return crypto.timingSafeEqual(expected, Buffer.from(hex, 'hex'));
}
```

### Python

```python
import hashlib, hmac, re

def verify(raw_body: bytes, timestamp: str, signature: str, secret: str) -> bool:
    if not timestamp or not signature or not secret:
        return False
    digest = signature.removeprefix("sha256=").lower()
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        return False
    signed = timestamp.encode("latin-1") + b"." + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).digest()
    return hmac.compare_digest(expected, bytes.fromhex(digest))
```

## Should I Reject Old Timestamps?

Not by default. Retries (up to 4 more attempts over about 2 hours) and Hookdeck replays resend the original `X-IG-Timestamp` and signature, and Hookdeck itself applies no tolerance, so a fixed window would reject legitimate deliveries. Make the handler idempotent instead (dedupe on `X-IG-Webhook-Id`).

The examples include an opt-in check: set `INFINITE_GIVING_WEBHOOK_TOLERANCE_SECONDS` to a positive number and a request whose `X-IG-Timestamp` (Unix seconds) differs from the current time by more than that is rejected with 401. Unset or `0` disables it. Retries and replays older than the window will then fail, so keep the window generous.

## Common Gotchas

- **Parsed body.** Re-serializing JSON changes bytes and breaks the signature. Use the raw body (`express.raw({ type: '*/*' })`, `await request.arrayBuffer()`, `await request.body()`).
- **Decoding bad hex.** `Buffer.from(sig, 'hex')` silently drops invalid characters. Validate the 64-character hex format first.
- **Wrong secret encoding.** Use the secret as UTF-8 text; don't base64-decode it.
- **Comparing strings.** Use a constant-time comparison on bytes (`crypto.timingSafeEqual`, `hmac.compare_digest`).
- **Case and prefix.** Hex is case-insensitive here, and the `sha256=` prefix is optional.

## How Do I Debug Verification Failures?

- Log the received `X-IG-Timestamp` and the first characters of `X-IG-Signature` (never the secret).
- Confirm the body is the unmodified raw bytes (no middleware parsed it first).
- Confirm the secret is the partner signing secret given at kickoff, with no surrounding whitespace.
- Reply status: missing/empty headers, malformed value, or mismatch all return `401`.
