# How to Verify Gitea Webhook Signatures

## How It Works

1. Gitea computes HMAC-SHA256 over the **raw request body** using the webhook Secret.
2. It sends the lowercase hex digest in `X-Gitea-Signature` (no prefix).
3. It also sends `X-Hub-Signature-256` as `sha256=<hex>` (same digest) and legacy `X-Hub-Signature` (`sha1=<hex>`).
4. You recompute the digest over the exact bytes received and compare in constant time.

There is no timestamp in the signed content. Use `X-Gitea-Delivery` for idempotency.

## Implementation

Gitea has no official webhook-verification SDK, so verification is manual.

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import hmac, hashlib

def verify(raw_body: bytes, signature: str, secret: str) -> bool:
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.encode(), expected.encode())
```

## Common Gotchas

- **Empty signature**: with no Secret configured, `X-Gitea-Signature` is present but empty. Reject it; never treat "empty equals empty" as valid.
- **Raw body**: verify before parsing. Re-serialized JSON will not match.
- **Form-encoded payloads**: when the content type is `application/x-www-form-urlencoded`, the signature is over the whole raw body (`payload=...`), not the decoded JSON. In Express use `express.raw({ type: '*/*' })` so any content type reaches the verifier as a Buffer; then parse `payload` yourself.
- **No prefix**: `X-Gitea-Signature` has no `sha256=`. Only `X-Hub-Signature-256` does.
- **Event name**: read `X-Gitea-Event`; the JSON body has no event field.
- **Old payloads**: very old Gitea versions put a `secret` field in the body. Current versions do not; always use the signature.

## Debugging Verification Failures

- Check **Recent Deliveries** in Gitea for the exact request body and headers.
- Confirm the secret matches exactly (no trailing whitespace).
- Make sure no middleware (JSON parser, proxy rewrite) altered the body.
- Compare against `X-Hub-Signature-256` to confirm the digest matches modulo the `sha256=` prefix.
