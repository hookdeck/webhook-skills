# How to Verify Campfire Webhook Signatures

## How Does Campfire Sign Webhooks?

| Item | Value |
|------|-------|
| Signature header | `Campfire-Webhook-Signature-v1` |
| Timestamp header | `Campfire-Webhook-Request-Timestamp` (Unix seconds) |
| Algorithm | HMAC-SHA256 |
| Signed message | `{timestamp}:{raw request body}`, joined by a single **colon** |
| Key | The webhook's 50-character signing secret (`token`), UTF-8 bytes as-is |
| Encoding | Lowercase hex, 64 characters, **no prefix** |

The `-v1` in the header name is a scheme version. The value is the bare digest. It is not Standard Webhooks (no `webhook-id` / `webhook-timestamp` / `webhook-signature`).

## Why Does It Matter That the Message Is Built as Bytes?

Hookdeck's Campfire source builds the message the same way, and so should you:

- literal `:` as UTF-8
- the timestamp header **exactly as received** (latin1; never trimmed, parsed or reformatted)
- the **raw body bytes** as received, concatenated

Never decode the body to a string and re-encode it, and never `JSON.parse` / `JSON.stringify` before verifying: whitespace and key order change the signature.

## Node.js

```javascript
const crypto = require('crypto');
const HEX_DIGEST = /^[0-9a-fA-F]{64}$/;

function verifyCampfireSignature(rawBody, headers, secret, toleranceSeconds = 0) {
  const timestamp = headers['campfire-webhook-request-timestamp'];
  const signature = headers['campfire-webhook-signature-v1'];
  if (!secret || !timestamp || !signature) return false;
  if (!HEX_DIGEST.test(signature)) return false; // validate before decoding

  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  }

  const message = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from(':'), rawBody]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature.toLowerCase(), 'hex'));
}
```

## Python

```python
import hashlib, hmac, re, time

HEX_DIGEST = re.compile(r"[0-9a-fA-F]{64}")

def verify_campfire_signature(raw_body: bytes, timestamp, signature, secret, tolerance_seconds=0) -> bool:
    if not secret or not timestamp or not signature:
        return False
    if not HEX_DIGEST.fullmatch(signature):  # validate before decoding
        return False
    if tolerance_seconds > 0:
        if not (timestamp.isascii() and timestamp.isdigit()):
            return False
        if abs(time.time() - int(timestamp)) > tolerance_seconds:
            return False
    message = b"".join([timestamp.encode("latin-1"), b":", raw_body])
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    return hmac.compare_digest(expected, bytes.fromhex(signature))
```

Complete handlers with tests: [../examples/express/](../examples/express/), [../examples/nextjs/](../examples/nextjs/), [../examples/fastapi/](../examples/fastapi/).

## Should I Reject Old Timestamps?

Campfire's docs recommend a 5-minute tolerance to prevent replay, and note that retries are re-signed with a fresh timestamp, so a tolerance check does not reject Campfire's own retries.

The examples here leave it **off by default**, because behind Hookdeck, retries and replays resend the **original** headers and timestamp, and Hookdeck applies no tolerance itself: a fixed window would reject legitimate redeliveries. To opt in, set `CAMPFIRE_WEBHOOK_TOLERANCE_SECONDS` (for example `300`; unset or `0` = off). With it on, a non-numeric timestamp is rejected. Make the handler idempotent either way.

## Common Gotchas

- **Colon, not dot.** `{timestamp}:{body}`. A dot-joined message (Stripe style) never matches.
- **Bare hex.** No `sha256=` or `v1=` prefix. Compare the whole header as one digest: no list splitting, no prefix parsing.
- **Raw body.** Express: `express.raw({ type: '*/*' })`; Next.js: `await request.arrayBuffer()`; FastAPI: `await request.body()`. Parse only after the check.
- **Secret is used as text.** Do not hex- or base64-decode the 50-character token.
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops invalid characters, so require exactly 64 hex characters first. Compare lowercased (hex is case-insensitive), in constant time, on equal-length bytes (`timingSafeEqual`, `hmac.compare_digest` on bytes, never str).
- **Header names** are case-insensitive; Node lowercases them (`campfire-webhook-signature-v1`).
- **Secret rotation** means a new webhook (the secret cannot be changed), so there is no multi-secret list to handle.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Always 401 | Parsed JSON re-serialized instead of raw bytes; wrong secret (API key instead of `token`); secret decoded |
| 401 only on some deliveries | Body modified by a proxy or middleware; secret from a different webhook |
| 401 with tolerance on | Clock skew, or a replay/retry through Hookdeck carrying the original timestamp |
| Works locally, fails deployed | A gateway rewrote or re-encoded the body |

Compare against **Recent Events** on the Campfire Webhooks page: it shows the exact headers, body and computed signature Campfire sent.
