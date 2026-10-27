# Featurebase Signature Verification

## How Does Featurebase Sign Webhooks?

Every request has two headers:

| Header | Value |
|--------|-------|
| `X-Webhook-Signature` | HMAC-SHA256 as a bare lowercase hex string (64 characters, no prefix) |
| `X-Webhook-Timestamp` | Unix time in seconds when Featurebase sent the request |

The signature is `hex(HMAC-SHA256(secret, timestamp + "." + rawBody))`. The key is the signing secret's UTF-8 bytes, used as-is, including its `whsec_` prefix. This is **not** Standard Webhooks: nothing is base64-decoded, there is no id header and the digest is hex. Do not use the `standardwebhooks` or `svix` libraries.

Paste the whole secret, including the whsec_ prefix. Featurebase uses it as a plain HMAC key.

## How Do I Verify It Manually?

Build the signed message as bytes: the timestamp header value as received (latin1), a literal `.`, then the raw body bytes. Never decode the body and re-encode it, and never `JSON.parse`/`JSON.stringify` before verifying.

### Node.js

```javascript
const crypto = require('crypto');
const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

function verifyFeaturebaseWebhook(rawBody, signature, timestamp, secret, toleranceSeconds = 0) {
  if (!secret || !signature || !timestamp) return false;
  if (!HEX_SHA256.test(signature)) return false; // Buffer.from(x, 'hex') silently drops bad characters
  const signed = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signed).digest();
  const provided = Buffer.from(signature.toLowerCase(), 'hex');
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return false;
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  }
  return true;
}
```

### Python

```python
import hashlib, hmac, re, time

def verify_featurebase_webhook(raw_body, signature, timestamp, secret, tolerance_seconds=0):
    if not secret or not signature or not timestamp:
        return False
    if not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    signed = timestamp.encode("latin-1") + b"." + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
    if not hmac.compare_digest(bytes.fromhex(signature), expected):  # bytes, never str
        return False
    if tolerance_seconds > 0:
        if not re.fullmatch(r"[0-9]+", timestamp) or abs(time.time() - int(timestamp)) > tolerance_seconds:
            return False
    return True
```

Return `401` on any failure. The full handlers are in [examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and [examples/fastapi/](../examples/fastapi/).

## Should I Reject Old Timestamps?

Not by default. Featurebase's own sample rejects timestamps older than 5 minutes, but Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck itself applies no tolerance, so a fixed window would reject legitimate retries (and replays you triggered on purpose). The examples make it opt-in: set `FEATUREBASE_WEBHOOK_TOLERANCE_SECONDS` (for example `300`) when you receive directly from Featurebase and want replay protection. Unset or `0` is off. `X-Webhook-Timestamp` is Unix seconds. Dedupe on the event `id` either way.

## Common Gotchas

- **Parsed body**: `express.json()` or `request.json()` before verifying changes the bytes. Use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` or `await request.body()`.
- **Stripping `whsec_`**: the key includes the prefix. Removing it, or base64-decoding the rest as Svix does, gives a different digest.
- **Hex case**: compare case-insensitively, after checking the value is exactly 64 hex characters.
- **Header trimming**: sign the timestamp exactly as received.
- **Per-webhook secrets**: each Featurebase webhook has its own secret. A refreshed secret invalidates the old one.
- **Sample code mismatch**: Featurebase's JavaScript sample interpolates the body into a template string. That is only safe for UTF-8 bodies; these examples concatenate bytes.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Always `Signature mismatch` | Body parsed first, wrong secret (another webhook), prefix stripped or base64-decoded |
| `Malformed signature` | A `sha256=` prefix was added, or the header was not the 64-character hex digest |
| `Missing signature, timestamp or secret` | Proxy dropped headers, or `FEATUREBASE_WEBHOOK_SECRET` is unset |
| Fails only on old or replayed events | `FEATUREBASE_WEBHOOK_TOLERANCE_SECONDS` is set |
