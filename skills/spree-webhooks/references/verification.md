# Spree Signature Verification

## How It Works

Each delivery has two headers:

| Header | Value |
|--------|-------|
| `X-Spree-Webhook-Signature` | Bare lowercase hex HMAC-SHA256 digest (64 characters, no prefix) |
| `X-Spree-Webhook-Timestamp` | Unix timestamp (seconds) generated at send time |

The signature is HMAC-SHA256 keyed with the endpoint's `secret_key` over the bytes `"<timestamp>."` followed by the raw request body. Spree's Ruby example:

```ruby
expected = OpenSSL::HMAC.hexdigest('SHA256', ENV['SPREE_WEBHOOK_SECRET'], "#{timestamp}.#{payload}")
```

## Implementation

`@spree/sdk/webhooks` (JavaScript/TypeScript, 1.2.1) exports `verifyWebhookSignature(payload, signature, timestamp, secret, toleranceSeconds = 300)`. It takes the body as text and rejects timestamps more than 300 seconds old by default, so these examples verify manually on the raw bytes instead; the `constructWebhookEvent` helper shown in Spree's docs is only in the 6.0 prerelease, and there is no Python SDK helper.

### Node.js

```javascript
const crypto = require('crypto');

function verifySpreeSignature(rawBody, signature, timestamp, secret) {
  if (!signature || !timestamp || !secret) return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const signed = Buffer.concat([Buffer.from(`${timestamp}.`, 'latin1'), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(signed).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
```

### Python

```python
import hashlib, hmac, re

def verify_spree_signature(raw_body: bytes, signature: str | None, timestamp: str | None, secret: str) -> bool:
    if not signature or not timestamp or not secret:
        return False
    if not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    signed = timestamp.encode("latin-1") + b"." + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest().encode()
    return hmac.compare_digest(expected, signature.lower().encode())
```

## Common Gotchas

- **Raw bytes only.** Build the signed message as bytes: the timestamp header string (latin1), a literal `.`, and the body exactly as received. Never decode and re-encode the body, and never `JSON.parse`/`JSON.stringify` before verifying. Express: `express.raw({ type: '*/*' })`; Next.js: `await request.arrayBuffer()`; FastAPI: `await request.body()`.
- **The secret is a string.** The 64-character hex `secret_key` is the HMAC key as its UTF-8 bytes. Hex-decoding it gives a different key and every check fails.
- **Bare digest.** The signature header is one hex digest: no `sha256=` prefix, no list, no `t=`/`v1=` parts.
- **Validate before decoding.** Require exactly 64 hex characters (case-insensitive), then compare in constant time. Node: `Buffer.from(sig, 'hex')` silently drops bad characters, so check the format first and use `crypto.timingSafeEqual` on equal-length buffers. Python: `hmac.compare_digest` on bytes.
- **Timestamp is a signed input.** Missing or empty signature or timestamp, a malformed signature or a mismatch returns 401.
- **Replay window is opt-in.** Do not reject old timestamps by default: Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck applies no tolerance, so a fixed window would reject legitimate retries. To enforce one, set `SPREE_WEBHOOK_TOLERANCE_SECONDS` (for example `300`; unset or `0` = off); `X-Spree-Webhook-Timestamp` is Unix seconds. Deduplicate on the event `id` instead.
- **Content type.** Deliveries are `application/json`, but read the raw body for any content type.

## Debugging Verification Failures

1. Confirm you use the `secret_key` of the endpoint that sent the delivery (each endpoint has its own).
2. Log the body's byte length and compare it with the delivery log; a middleware that parses or re-serializes the body breaks the signature.
3. Check you are not hex-decoding the secret.
4. Send a `webhook.test` with `send_test` to check your code end to end.
5. If you lost the secret, it cannot be retrieved: create a new endpoint to get a new `secret_key`.
