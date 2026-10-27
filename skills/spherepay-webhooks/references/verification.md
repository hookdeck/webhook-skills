# SpherePay Webhook Signature Verification

## How Does SpherePay Sign Webhooks?

SpherePay never sends an unsigned delivery. Every request carries:

| Header | Meaning |
|--------|---------|
| `Sphere-Signature` | Bare lowercase hex HMAC-SHA256 digest (64 characters, no prefix) |
| `Sphere-Timestamp` | Unix seconds when this attempt was sent (part of the signed input) |

```
signature = hex( HMAC-SHA256( secret, "{Sphere-Timestamp}.{raw body}" ) )
```

- **Key:** the endpoint's whole signing secret (`whsec_...`) as UTF-8 bytes, used as-is. Not hex- or base64-decoded; the `whsec_` prefix stays.
- **Message (bytes):** the `Sphere-Timestamp` header value (latin-1, exactly as received, never trimmed or reformatted), a literal `.`, then the raw request body bytes. This matches Hookdeck's `{header:sphere-timestamp}.{body}` template.
- **Not Standard Webhooks.** There is no `webhook-id`, nothing is base64, and the digest is hex. Do not use the `standardwebhooks` or `svix` libraries.

Paste the whole secret, including the whsec_ prefix. SpherePay uses it as a plain HMAC key.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

const signed = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody]);
const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signed).digest();

if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;     // validate first
const received = Buffer.from(signature.toLowerCase(), 'hex');  // now safe to decode
return expected.length === received.length && crypto.timingSafeEqual(expected, received);
```

### Python

```python
import hashlib, hmac, re

signed = b"".join([timestamp.encode("latin-1"), b".", raw_body])
expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()

if not re.fullmatch(r"[0-9a-fA-F]{64}", signature):         # validate first
    return False
return hmac.compare_digest(expected, bytes.fromhex(signature.lower()))
```

The runnable, tested versions are in `examples/express`, `examples/nextjs` and `examples/fastapi`.

## Published Test Vector

SpherePay's docs give a worked example (the same `whsec_9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c` secret as its endpoint-creation example). Every example's test suite includes it, and it matches Hookdeck's template:

- Secret: `whsec_9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c`
- `Sphere-Timestamp`: `1786111531`
- Body (exact bytes, no pretty-printing): the compact `transfer.succeeded` JSON for `event_01HXPA3M9R7DEF456` shown in the example tests
- `Sphere-Signature`: `4f04e86648d8f1341d431b4cfa00eaeb7c69b7b3fcee7dff97b24f95482a6be2`

If your verifier computes a different digest for this vector, the problem is in the signed bytes or the key, not the transport.

## Replay Protection (Optional Timestamp Window)

SpherePay's docs suggest rejecting a `Sphere-Timestamp` more than 5 minutes old. The examples **do not check it by default**: Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck itself applies no tolerance, so a fixed window would reject legitimate redeliveries. To opt in, set `SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds (for example `300`); unset or `0` is off, and a value that isn't a whole number is treated as `0` with a warning. When it is on, a non-numeric timestamp is rejected. Use the body's event `id` for idempotency to absorb duplicates either way.

SpherePay's own manual replays get a fresh timestamp and signature, so they would pass a window; redeliveries of the original request from Hookdeck would not.

## Common Gotchas

- **Raw body:** the signature covers the exact bytes. Don't `JSON.parse`/re-serialise first, and don't decode and re-encode the body as a string. Use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` or `await request.body()`.
- **Whole secret:** keep `whsec_` in the key. Stripping it or decoding the rest gives a different digest.
- **Whole header:** compare `Sphere-Signature` as one digest; there is no list, `v1=` or `sha256=` prefix.
- **Validate before decoding:** `Buffer.from(x, 'hex')` silently drops bad characters, so check length and alphabet first. Hex case doesn't matter, so lowercase both sides.
- **Status codes:** missing or empty header, malformed value, or mismatch gets `401`. A missing local secret is a `500`.
- **One attempt:** SpherePay won't retry a failed delivery, so a wrong secret in production means lost events until you replay them.

## Debugging Verification Failures

1. Is `SPHEREPAY_WEBHOOK_SECRET` the secret from *this* endpoint's creation response (each endpoint has its own), with `whsec_` intact and no trailing whitespace?
2. Is your framework giving you the raw bytes (not a parsed and re-serialised body)?
3. Did a proxy change the body or add compression handling that alters bytes?
4. Run the published vector above through your verifier; it must produce `4f04e866...6be2`.
5. Use `Sphere-Delivery-Id` to look up the delivery and attempt in the Events API, and replay it once fixed.
