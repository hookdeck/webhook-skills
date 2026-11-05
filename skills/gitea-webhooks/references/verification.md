# How to Verify Gitea Webhook Signatures

## How It Works

1. Gitea computes HMAC-SHA256 over the **JSON payload** using the webhook Secret. For `POST` + `application/json` that payload is the raw request body.
2. It sends the lowercase hex digest in `X-Gitea-Signature` (no prefix).
3. It also sends `X-Hub-Signature-256` as `sha256=<hex>` (same digest) and legacy `X-Hub-Signature` (`sha1=<hex>`).
4. You recompute the digest over the exact bytes received and compare in constant time.

There is no timestamp in the signed content. `X-Gitea-Delivery` is unique per attempt, so a redelivery gets a new value: build idempotency keys from what changed, such as a push's `after` SHA.

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
- **Form-encoded and GET deliveries**: a form delivery's body is `payload=<url-encoded JSON>` and a `GET` puts the payload in the query string, but Gitea still signs the JSON payload (`body = []byte(t.PayloadContent)` in `services/webhook/deliver.go`). The signature never matches the bytes received, so set the webhook to `POST` + `application/json`.
- **No prefix**: `X-Gitea-Signature` has no `sha256=`. Only `X-Hub-Signature-256` does.
- **Event name**: `X-Gitea-Event` is the group and `X-Gitea-Event-Type` the exact trigger; the JSON body has no event field.
- **Old payloads**: very old Gitea versions put a `secret` field in the body. Current versions do not; always use the signature.

## Debugging Verification Failures

- Check **Recent Deliveries** in Gitea for the exact request body and headers.
- Confirm the secret matches exactly (no trailing whitespace).
- Make sure no middleware (JSON parser, proxy rewrite) altered the body.
- Compare against `X-Hub-Signature-256` to confirm the digest matches modulo the `sha256=` prefix.
