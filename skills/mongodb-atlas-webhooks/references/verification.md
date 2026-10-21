# MongoDB Atlas Signature Verification

## How Does Atlas Sign Webhooks?

When a Webhook Secret is set, Atlas adds:

```
X-MMS-Signature: <base64(HMAC-SHA1(secret, raw request body))>
```

- Algorithm: HMAC-SHA1
- Encoding: base64 (28 characters, ending in `=`)
- Signed content: the raw request body only (no timestamp, no prefix)
- Key: the Webhook Secret as a raw string (do not base64-decode it)
- Not Standard Webhooks; there are no `webhook-*` headers
- No official SDK helper; verify manually

Without a secret the header is absent. Atlas has no replay protection in the signature, so make handlers idempotent.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('base64');
crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)); // throws on length mismatch
```

### Python

```python
import base64, hashlib, hmac

digest = hmac.new(secret.encode(), raw_body, hashlib.sha1).digest()
expected = base64.b64encode(digest).decode()
hmac.compare_digest(signature.encode(), expected.encode())
```

Complete handlers: [Express](../examples/express/), [Next.js](../examples/nextjs/), [FastAPI](../examples/fastapi/).

## Common Gotchas

- **Raw body:** use `express.raw({ type: '*/*' })`, `request.text()`, or `await request.body()`. Re-serialized JSON changes bytes.
- **Base64, not hex:** a hex digest never matches.
- **SHA-1, not SHA-256.**
- **Optional header:** a missing `X-MMS-Signature` means no secret is configured in Atlas. Reject it if you expect signing.
- **Custom body templates** are signed as sent; verify before parsing.

## How to Debug Verification Failures

- Confirm the secret in Atlas matches your env var exactly (no trailing whitespace or newline).
- Log the header and your computed value, compare lengths (28 chars).
- Check a proxy or gateway isn't modifying the body.
- Use the Activity Feed to see what Atlas received as a response.
