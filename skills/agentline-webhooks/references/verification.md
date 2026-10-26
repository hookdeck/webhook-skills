# AgentLine Signature Verification

## How Does AgentLine Sign Webhooks?

- Header: `X-Webhook-Signature` (the default; keep it — see [setup.md](setup.md))
- Algorithm: HMAC-SHA256 over the **raw request body**
- Key: the webhook signing secret, used as a UTF-8 string
- Encoding: bare lowercase hex digest (64 chars), no prefix, no timestamp

No timestamp is signed, so replay protection comes from idempotency (dedupe on
`event_id` if your delivery includes it).

## Implementation

AgentLine has no published webhook verification SDK for Node, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyAgentLineSignature(rawBody, signature, secret) {
  if (!/^[0-9a-f]{64}$/i.test(signature || '')) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
```

### Python

```python
import hashlib, hmac

def verify(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode(), signature.lower().encode())
```

## Common Gotchas

- **Raw body**: Express needs `express.raw({ type: '*/*' })` so any content type is verified over exact bytes; Next.js uses `request.text()`; FastAPI uses `await request.body()`.
- **Validate hex before `Buffer.from(x, 'hex')`**: invalid hex is silently truncated, which can make a malformed header compare equal to a shorter digest.
- **`timingSafeEqual` throws on length mismatch**: check length (the 64-hex regex does this) first.
- **Python `compare_digest` with `str`**: raises `TypeError` for non-ASCII input (a 500). Encode both sides to bytes.
- **Custom `signature_header`**: not supported by Hookdeck's AgentLine source; keep the default.
- **Secret shown once**: if lost, re-POST the webhook to set a new secret.

## Debugging Verification Failures

1. Confirm the secret is the full value from creation (not the masked one).
2. Confirm you hash the raw bytes, not re-serialized JSON.
3. Trigger `webhook.test` and log the received header and body.
4. Confirm the webhook still uses `X-Webhook-Signature`.
