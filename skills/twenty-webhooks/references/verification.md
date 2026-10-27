# How to Verify Twenty Webhook Signatures

## How It Works

> Set a secret on the Twenty webhook (Settings > Developers > Webhooks). Twenty signs deliveries only when the webhook has a secret.

Twenty signs each delivery with HMAC-SHA256 and sends:

- `X-Twenty-Webhook-Signature`: the **bare lowercase hex digest** (64 characters, no `sha256=` or other prefix)
- `X-Twenty-Webhook-Timestamp`: `Date.now()` at send time, Unix **milliseconds**
- `X-Twenty-Webhook-Nonce`: sent but not part of the signed content

The signed message is the timestamp header value, a literal **colon**, then the raw body:

```
HMAC_SHA256(key = secret (UTF-8), message = "<X-Twenty-Webhook-Timestamp>:" + raw body)  ->  hex
```

Twenty's docs describe this as `{timestamp}:{JSON payload}` and show `JSON.stringify(req.body)`. Twenty's sender signs the JSON string it posts, so the raw body *is* the signed text; sign the raw body rather than re-serialising parsed JSON.

## Implementation

Twenty has no webhook verification SDK, so verify manually. Build the signed message as **bytes**: the separator as UTF-8, the timestamp header as the exact string encoded latin-1 (a header is never trimmed, parsed or re-formatted), and the raw body bytes as received. Never decode the body to a string and re-encode it, and never `JSON.parse`/`JSON.stringify` before verifying.

### Node.js

```javascript
const crypto = require('crypto');

function verifyTwentySignature(rawBody, signature, timestamp, secret) {
  if (!signature || !timestamp || !secret) return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;

  const signed = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from(':'), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(signed).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(expected, received);
}
```

### Python

```python
import hashlib, hmac, re

def verify_twenty_signature(raw_body: bytes, signature: str | None, timestamp: str | None, secret: str) -> bool:
    if not signature or not timestamp or not secret:
        return False
    if not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    try:
        signed = b"".join([timestamp.encode("latin-1"), b":", raw_body])
    except UnicodeEncodeError:
        return False
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest().encode()
    return hmac.compare_digest(expected, signature.lower().encode())
```

Complete handlers with tests: [Express](../examples/express/), [Next.js](../examples/nextjs/), [FastAPI](../examples/fastapi/).

## Common Gotchas

- **Raw body.** Read the body as bytes before any JSON parsing. Express: `express.raw({ type: '*/*' })` (so any content type works); Next.js: `await request.arrayBuffer()`; FastAPI: `await request.body()`.
- **Secret is used as-is.** Treat it as UTF-8 text for the HMAC key. Don't hex- or base64-decode it.
- **Separator is a colon**, not a dot or comma, and the timestamp is the header value verbatim.
- **No prefix, one digest.** Compare the whole header value as a single hex digest; don't split lists or strip a scheme. Hex is case-insensitive, so lowercase both sides.
- **Validate before decoding.** Require exactly 64 hex characters before `Buffer.from(sig, 'hex')`, which silently drops invalid characters. Compare equal-length buffers in constant time (`crypto.timingSafeEqual` / `hmac.compare_digest` on bytes).
- **Unsigned deliveries.** Twenty signs only when the webhook has a secret. A delivery with no signature headers is rejected with 401.
- **Timestamp is milliseconds**, not seconds.

## Timestamp Tolerance (opt-in)

The examples do **not** reject old timestamps by default. Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck itself applies no tolerance, so a fixed window would reject legitimate retries. If you want replay protection at the receiver, set `TWENTY_WEBHOOK_TOLERANCE_SECONDS` (for example `300`); the examples then reject a timestamp more than that many seconds from now (unset or `0` = off). Prefer idempotent handlers for replay safety. The nonce is not signed, so it can't prove freshness.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request, no signature header in the logs | The webhook in Twenty has no secret set |
| 401 with a valid-looking header | Body was parsed and re-serialised, or the wrong secret / secret decoded |
| 401 only with a tolerance set | Timestamp is in milliseconds; or the delivery is a retry/replay of an old event |
| Works locally, fails behind a proxy | A proxy modified the body bytes |

Inspect the exact headers and raw body of a failed delivery in the Hookdeck CLI web UI.
