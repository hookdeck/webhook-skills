# How to Verify Cashfree Webhook Signatures

## How Does Cashfree Sign Webhooks?

One scheme covers Payment Gateway, Payouts V2, Secure ID and PPI:

| Item | Value |
|------|-------|
| Signature header | `x-webhook-signature` |
| Timestamp header | `x-webhook-timestamp` |
| Algorithm | HMAC-SHA256 |
| Signed content | `x-webhook-timestamp` value followed by the raw body, **no separator** |
| Key | Client secret as UTF-8 bytes (Partner API key for partner webhooks) |
| Encoding | Standard base64, padded, no prefix (44 characters) |

Cashfree's docs: `signedPayload = x-webhook-timestamp + rawBody`, `expectedSignature = Base64Encode(HMAC-SHA256(signedPayload, clientSecret))`.

Legacy Payouts V1 / Cashgram webhooks are form-encoded and use a different scheme. They fail this verification.

## Manual Verification

Build the signed message as bytes: the header string as latin-1, then the raw body bytes.

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody /* Buffer */, headers, secret) {
  const sig = headers['x-webhook-signature'];
  const ts = headers['x-webhook-timestamp'];
  if (!sig || !ts || !/^[A-Za-z0-9+/]{43}=$/.test(sig)) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(ts, 'latin1'), rawBody]))
    .digest('base64');
  const a = Buffer.from(expected, 'latin1');
  const b = Buffer.from(sig, 'latin1');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import base64, hashlib, hmac, re

def verify(raw_body: bytes, signature: str, timestamp: str, secret: str) -> bool:
    if not signature or not timestamp or not re.fullmatch(r"[A-Za-z0-9+/]{43}=", signature):
        return False
    signed = b"".join([timestamp.encode("latin-1"), raw_body])
    digest = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64encode(digest), signature.encode("ascii"))
```

## Does Cashfree Have an SDK?

Yes. The `cashfree-pg` Node package exposes `PGVerifyWebhookSignature(signature, rawBody, timestamp)`, and Cashfree's docs show manual versions in Go, Java, PHP and Python. The examples here verify by hand so they work the same in every framework and handle the raw body as bytes.

## Should I Reject Old Timestamps?

Not by default. Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck applies no tolerance itself, so a fixed window would reject legitimate retries. Cashfree's docs suggest a 5-minute window, but the unit of `x-webhook-timestamp` is not stated (check a real delivery).

The examples offer an opt-in check: set `CASHFREE_WEBHOOK_TOLERANCE_SECONDS` (unset or `0` = off). Values above `1e11` are read as milliseconds, anything else as seconds. Prefer idempotent handling over a window.

## Common Gotchas

- **Raw body.** Parsing and re-serialising JSON changes whitespace, field order or number formatting and breaks the signature. Express: `express.raw({ type: '*/*' })`. Next.js: `await request.arrayBuffer()`. FastAPI: `await request.body()`.
- **Order.** Timestamp first, then the body. `body + timestamp` or `timestamp + "." + body` will not match.
- **No hex, no prefix.** The header is the whole digest. Do not split it, strip a prefix, or hex-decode it.
- **Secret is used as-is.** Not base64- or hex-decoded.
- **Exact base64.** Compare case-sensitively. Check the 44-character format before decoding, because Node's `Buffer.from(sig, 'base64')` silently drops invalid characters.
- **Respond 200.** Anything else (3xx included) counts as a failure and triggers retries.
- **Wrong environment.** Sandbox and production use different client secrets.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every delivery fails | Wrong secret (Partner API key vs merchant client secret, sandbox vs production), or a legacy Payouts V1 / Cashgram webhook |
| Only some deliveries fail | Body was parsed or re-serialised, or a proxy changed it |
| Fails after adding a separator | Remove it: the timestamp and body are concatenated directly |
| `Malformed x-webhook-signature` | The header is not 44-character padded base64 (hex, prefixed or trimmed) |
| Fails only with the tolerance on | Timestamp unit or clock skew; check a real delivery |
