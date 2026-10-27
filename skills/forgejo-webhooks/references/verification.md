# How to Verify Forgejo Webhook Signatures

## How It Works

1. Forgejo computes HMAC-SHA256 over the **JSON payload** using the webhook Secret (as UTF-8 bytes) as the key.
2. It sends the lowercase hex digest in `X-Forgejo-Signature` (no prefix).
3. The same digest is sent as `X-Gitea-Signature` and `X-Gogs-Signature`, as `X-Hub-Signature-256: sha256=<hex>`, and as a SHA-1 `X-Hub-Signature: sha1=<hex>`. This skill verifies `X-Forgejo-Signature`.
4. You recompute the digest over the exact bytes received and compare in constant time.

Only the body is signed: no timestamp, delivery id or other header. There is no replay window to enforce; use `X-Forgejo-Delivery` for idempotency.

> Set a secret on the Forgejo webhook. Without one, deliveries are unsigned and fail verification. Set the webhook's HTTP method to POST and its content type to application/json. Form-encoded and GET deliveries sign the JSON payload rather than the request body and fail verification.

For `POST` + `application/json` the signed payload is the request body byte for byte, which is why that is the only supported configuration.

## Implementation

Forgejo has no webhook-verification SDK, so verification is manual. Validate the header's format (exactly 64 hex characters) before decoding, and compare as bytes in constant time. Hex is accepted in either case.

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signature, secret) { // rawBody: Buffer
  if (!secret || typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase(), 'hex'), expected);
}
```

### Python

```python
import hashlib, hmac, re

def verify(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    if not secret or not signature or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature), expected)
```

## Common Gotchas

- **Empty signature**: with no Secret configured, `X-Forgejo-Signature` is present but empty. Reject it; never treat "empty equals empty" as valid.
- **GET and form-encoded deliveries**: the digest is over the JSON payload, not the request body, so verification fails. Use `POST` + `application/json`.
- **Raw body**: verify the bytes as received, before any parsing. Re-serialized JSON will not match. In Express use `express.raw({ type: '*/*' })`; in Next.js `await request.arrayBuffer()`; in FastAPI `await request.body()`.
- **No prefix**: `X-Forgejo-Signature` is bare hex. Only `X-Hub-Signature-256` has `sha256=`.
- **Secret is not decoded**: do not hex- or base64-decode it.
- **Event name**: read `X-Forgejo-Event-Type`; the body has no event field. `X-Forgejo-Event` is the coarser group.

## Debugging Verification Failures

- Check **Recent Deliveries** in Forgejo for the exact request body, method and headers.
- Confirm the webhook is `POST` with `application/json`.
- Confirm the secret matches exactly (no trailing whitespace) and is set on the webhook.
- Make sure no middleware (JSON parser, proxy rewrite) altered the body.
- Compare against `X-Hub-Signature-256` to confirm the digest matches modulo the `sha256=` prefix.
