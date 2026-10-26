# HitPay Signature Verification

## How Does HitPay Sign Webhooks?

`Hitpay-Signature` is the hex HMAC-SHA256 of the **raw request body bytes**, keyed with the salt of the webhook endpoint (Developers > Webhooks > the webhook's detail view). There is no timestamp and no signed prefix: the signed content is the body itself.

HitPay uses two different salts:

| | API-key salt | Per-webhook salt |
|---|---|---|
| Where | Developers page, next to the API key | Developers > Webhooks, the webhook's detail view |
| Used for | Legacy payment-request, charge, recurring, order and plugin callbacks | Event webhooks (this skill) |
| Signature in | `hmac` field in the payload | `Hitpay-Signature` header |
| What's signed | Sorted, concatenated parameters | Raw JSON body |

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyHitpaySignature(rawBody, signature, salt) {
  if (!salt) return false;
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', salt).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected));
}
```

### Python

```python
import hashlib, hmac

def verify_hitpay_signature(raw_body: bytes, signature, salt: str) -> bool:
    if not salt or not signature:
        return False
    expected = hmac.new(salt.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode(), signature.lower().encode())
```

HitPay's own Node sample builds `Buffer.from(computed)` and `Buffer.from(signature)` and calls `timingSafeEqual` directly, which throws a `RangeError` when the lengths differ. Check the length first, as above.

## Common Gotchas

- **Raw body.** Sign the bytes as received. In Express use `express.raw({ type: '*/*' })` (HitPay's sample uses `application/json`, which leaves other content types unparsed and unverified). In Next.js use `request.arrayBuffer()`; in FastAPI `await request.body()`.
- **Don't decode the signature as hex without validating.** `Buffer.from(x, 'hex')` silently truncates at the first invalid character. Either require `/^[0-9a-f]{64}$/i` first, or compare the hex strings as equal-length buffers as shown.
- **Python str vs bytes.** `hmac.compare_digest` raises `TypeError` for non-ASCII `str`; encode both sides so a bad header is a 401, not a 500.
- **Wrong salt.** Using the API-key salt is the most common failure.
- **Event name.** It is not in the body. Build it from `Hitpay-Event-Object` and `Hitpay-Event-Type`.
- **Retries.** HitPay's docs do not describe a retry schedule; make handlers idempotent on the object `id` anyway.

## How Do I Debug Verification Failures?

1. Confirm the salt is from the webhook's detail view, not the API-key salt.
2. Log the raw body length and compare with the Content-Length header; if a framework parsed the JSON first, the bytes differ.
3. Check the header is present: `Hitpay-Signature` (header names are case-insensitive; Node lowercases them).
4. Compute the HMAC locally: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SALT"`.
5. If the payload has an `hmac` field and is form-encoded, it is a legacy callback, which this skill doesn't cover.
