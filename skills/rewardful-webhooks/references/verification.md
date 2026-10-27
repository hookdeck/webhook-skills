# How to Verify Rewardful Webhook Signatures

## How Does Rewardful Sign Webhooks?

The signature is in the `X-Rewardful-Signature` header:

```
X-Rewardful-Signature: <64 lowercase hex characters>
```

It is the HMAC-SHA256 of the **raw request body**, keyed with the endpoint's Signing Secret, as
lowercase hex with no prefix. Rewardful's own sample is
`OpenSSL::HMAC.hexdigest('sha256', signing_secret, request.raw_post)`. Nothing else is signed: no
timestamp, no event id, no other header. There is therefore no replay window to enforce; dedupe
on `event.id` instead.

## Implementation

### Node.js (Express: `express.raw({ type: '*/*' })`)

```javascript
const crypto = require('crypto');

function verifyRewardfulSignature(rawBody, signature, secret = process.env.REWARDFUL_WEBHOOK_SECRET) {
  if (!secret || !Buffer.isBuffer(rawBody)) return false;
  if (typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
```

### Python (FastAPI: `await request.body()`)

```python
import hashlib, hmac, re

def verify_rewardful_signature(raw_body: bytes, signature: str | None, secret: str) -> bool:
    if not secret or not signature or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(expected, bytes.fromhex(signature))
```

Rewardful has no official Node or Python verification helper, so both examples verify manually.

## Common Gotchas

- **Raw body.** Verify the exact bytes received. `JSON.parse` then `JSON.stringify` (or
  `json.loads` then `json.dumps`) changes whitespace and key order and breaks the signature.
- **Express.** Use `express.raw({ type: '*/*' })` on the route, not `express.json()`. In Next.js
  use `await request.arrayBuffer()`; in FastAPI `await request.body()`.
- **Key is the plain secret.** Not hex- or base64-decoded.
- **Validate before decoding.** Check exactly 64 hex characters first; `Buffer.from(x, 'hex')`
  silently drops invalid characters. Hex is case-insensitive, so either case is accepted.
- **Constant-time compare.** Rewardful's docs samples use `==`; use `timingSafeEqual` /
  `compare_digest` on bytes instead.
- **One secret per endpoint.** An endpoint's secret does not verify another endpoint's deliveries.
- **Status codes.** Only `200` is success for Rewardful; a `401` counts as a failure and is retried.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always 401 | Wrong endpoint's secret, or the secret was edited (whitespace, quotes in `.env`) |
| 401 only locally | A proxy or framework re-encoded the body; verify the raw bytes |
| 401 after adding middleware | `express.json()` ran first and consumed the body |
| Header missing | Request did not come from Rewardful, or a gateway stripped it |
