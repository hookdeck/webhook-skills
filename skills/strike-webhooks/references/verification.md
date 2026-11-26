# How to Verify Strike Webhook Signatures

## How Does Strike Sign Webhooks?

Plain HMAC. Strike's docs: "The Strike API will sign each webhook using a hash-based message authentication code (HMAC) with SHA-256 signature in the `X-Webhook-Signature` header."

| Part | Value |
|---|---|
| Header | `X-Webhook-Signature` |
| Algorithm | HMAC-SHA256 |
| Encoding | Lowercase hex, 64 characters, no prefix |
| Signed content | The raw request body, exactly as received |
| Key | The subscription `secret` you chose (10-50 chars), as UTF-8 text. **Not** the API key |

There is no timestamp, nonce, scheme prefix (`sha256=`), versioned signature list, public key or handshake. It is not Standard Webhooks, and it is unrelated to Stripe's `Stripe-Signature: t=...,v1=...`.

Docs, step 2: "Compute the HMAC using the SHA-256 hash of the webhook request's JSON payload (the webhook's content) and the `secret` that was used when creating the webhook subscription."

## Implementation

Strike has no official SDK helper for webhook verification, so the examples verify manually in all three frameworks.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyStrikeSignature(rawBody, signature, secrets) {
  const value = String(signature || '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(value)) return false; // also guards timingSafeEqual
  const received = Buffer.from(value, 'hex');
  return secrets.some((secret) =>
    crypto.timingSafeEqual(received, crypto.createHmac('sha256', secret).update(rawBody).digest())
  );
}
```

Get the raw body with `express.raw({ type: 'application/json' })` (the example uses `*/*`), or `Buffer.from(await request.arrayBuffer())` in a Next.js route handler. `secrets` is `[STRIKE_WEBHOOK_SECRET]`, plus `STRIKE_WEBHOOK_SECRET_PREVIOUS` during a rotation.

### Python (FastAPI)

```python
import hashlib, hmac, re
from typing import List, Optional

def verify_strike_signature(raw_body: bytes, signature: Optional[str], secrets: List[str]) -> bool:
    value = (signature or "").strip()
    if not re.fullmatch(r"[0-9a-fA-F]{64}", value):
        return False
    received = bytes.fromhex(value)
    return any(
        hmac.compare_digest(received, hmac.new(s.encode(), raw_body, hashlib.sha256).digest())
        for s in secrets
    )
```

Use `raw_body = await request.body()`.

## Why Not Copy Strike's JavaScript Sample?

Strike's sample hashes `JSON.stringify(request.body)`: the *parsed* body re-serialised, not the bytes Strike sent:

```javascript
function getRawBody(body) {
  const array = []
  const str = JSON.stringify(body)
  const buffer = Buffer.from(str, 'utf8')
  for (var i = 0; i < buffer.length; i++) array.push(buffer[i])
  return new Uint8Array(array)
}
```

That works today only because Strike's payload is small, compact JSON whose key order survives a parse/stringify round trip. Any pretty-printing, a proxy that rewrites the body, or a future field containing an escaped character (`\u00e9` comes back as `é`) changes the bytes, and the signature stops matching. Strike signs the bytes it sent, not a canonical form, so hashing the raw body is the same check without the fragility.

The sample has two more problems. It never imports `crypto`. And it throws on bad input: `crypto.timingSafeEqual` raises a `RangeError` when the two buffers differ in length, and `Buffer.from(undefined)` throws when the header is missing. A truncated or absent header becomes a `500` instead of a `401`. Validate the header's format and length first, as above.

## Status Codes

| Situation | Response |
|---|---|
| `STRIKE_WEBHOOK_SECRET` not set | `401`, and log it. Fail closed: never skip verification. |
| Missing, malformed or wrong signature | `401` |
| Valid signature, body isn't JSON | `400` |
| Valid, duplicate `id` | `200` (already handled) |
| Valid, unknown `eventType` | `200` (Strike can add events within v1) |
| Valid, known event | `200` immediately; fetch the entity afterwards |

Never answer `410` or `501` unless you mean it: both tell Strike to stop retrying that delivery.

There's no documented source IP allowlist, no `User-Agent` to check and no verification ping. The signature is the only authentication, so there should be no code path that accepts an unsigned request.

## Common Gotchas

- **Body parsed before verifying.** `express.json()` (or any global body parser) consumes the stream, and re-serialising produces different bytes. Mount `express.raw()` on the webhook route only.
- **Wrong key.** The key is the subscription `secret`, not `STRIKE_API_KEY`. Keep them in separate env vars.
- **Base64 or a prefix.** The header is bare lowercase hex. Don't base64-decode it or look for `sha256=`.
- **Length mismatch crash.** Check for 64 hex characters before `timingSafeEqual`, or wrap it.
- **Secret edits.** The secret is "any arbitrary string". Use it exactly as you sent it to Strike; don't trim or re-encode it.
- **Rotation.** Strike signs with one secret at a time and documents no overlap. Accept the old and new secret briefly while you rotate.

## How to Debug Verification Failures

1. Log the length and first bytes of the raw body your handler hashes, and compare them with the request shown in the Hookdeck CLI or Webhook.site. If they differ, something parsed or rewrote the body.
2. Recompute by hand on the exact body:
   ```bash
   printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$STRIKE_WEBHOOK_SECRET"
   ```
   It should equal `X-Webhook-Signature`.
3. Confirm the secret is the one on the subscription. If unsure, set a new one with `PATCH /v1/subscriptions/{subscriptionId}`.
4. If verification passes but Strike keeps retrying, your handler is taking longer than 5 seconds. Respond before calling the Strike API.
