# TheirStack Signature Verification

## How Does TheirStack Sign Webhooks?

When a signing secret is set on the webhook, TheirStack computes the HMAC-SHA256 hex digest of the **raw JSON body** keyed with the secret and sends:

```
X-TheirStack-Signature-256: sha256=<hex_digest>
```

- Algorithm: HMAC-SHA256, hex encoded (64 characters)
- Signed content: the raw request body only (no timestamp, no event id)
- Prefix: `sha256=` is part of the header value; require it and strip it
- Secret: your own string or a generated one, at least 16 characters, used as-is (UTF-8)
- Header only exists when a secret is configured

There is no SDK, so verification is manual. TheirStack's signature carries no timestamp, so there is no replay window to enforce; deduplicate on the record `id` instead.

## Implementation

### Node.js (Express and Next.js)

```javascript
const crypto = require('crypto');

function verifyTheirStackWebhook(rawBody, signatureHeader, secret) {
  if (!secret || typeof signatureHeader !== 'string') return false;
  if (!signatureHeader.startsWith('sha256=')) return false;
  const received = signatureHeader.slice('sha256='.length);
  // Exactly 64 hex chars first: Buffer.from(x, 'hex') silently truncates invalid input
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}
```

Express must read the raw body: `express.raw({ type: '*/*' })`. In Next.js App Router use `Buffer.from(await request.arrayBuffer())`.

### Python (FastAPI)

```python
import hmac, hashlib

def verify_theirstack_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    if not secret or not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    received = signature_header[len("sha256="):].lower().encode()
    return hmac.compare_digest(received, expected.encode())
```

`hmac.compare_digest` raises `TypeError` for non-ASCII `str` arguments, so encode both sides to bytes; a malformed header then yields 401 instead of 500. Use `await request.body()` in FastAPI.

## Test Vector

From TheirStack's docs; use it to check your implementation:

| Field | Value |
|-------|-------|
| Secret | `It's a Secret to Everybody` |
| Payload | `Hello, World!` |
| Expected | `sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17` |

## Common Gotchas

- **Missing header**: sent only when a signing secret is configured. Unsigned deliveries cannot be verified, so set a secret.
- **Raw body**: do not parse and re-serialize JSON; key order and whitespace change the digest.
- **Prefix**: compare the digest after `sha256=`, not the whole header against a bare hex string.
- **Plain `==`**: use a constant-time comparison.
- **Uppercase hex**: normalise case before comparing (the Node example accepts either via a hex decode, the Python example lowercases).

## Debugging Verification Failures

1. Log the raw body length and the received header; confirm the header starts with `sha256=`.
2. Run the test vector above through your function.
3. Confirm the secret matches the one saved on the TheirStack webhook exactly (no trailing newline).
4. Check no middleware parses the body before verification.
5. Check a proxy has not modified the body.
