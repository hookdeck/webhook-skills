# Yapily Webhook Signature Verification

## How Does Yapily Sign Webhooks?

- Header: `webhook-signature`
- Algorithm: HMAC-SHA256
- Key: the webhook secret (`webhookSecret` from registration) as a UTF-8 string, used as-is (no base64 decoding, no prefix to strip)
- Signed content: the raw request body, nothing else
- Encoding: plain hex digest, no `sha256=` prefix
- Comparison: Yapily's own samples lowercase the header before comparing, so treat it as case-insensitive

**It is not Standard Webhooks.** The header name looks similar, but there is no `webhook-id` or `webhook-timestamp`, no `v1,` prefix, and no base64 key. A Standard Webhooks library will reject every Yapily delivery.

## How Do I Verify During a Secret Rotation?

`POST /webhook/secrets/{webhook_id}` can reset the secret with a delay. During that window each delivery carries two signatures: `webhook-signature` and `webhook-rotation-signature`. Accept the request if **either** matches your current secret. Once you've switched secrets and the window ends, the second header disappears.

## Implementation

Yapily has no webhook-verification SDK; verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyYapilyWebhook(rawBody, signatures, secret) {
  const expected = Buffer.from(
    crypto.createHmac('sha256', Buffer.from(secret, 'utf-8')).update(rawBody).digest('hex')
  );
  return signatures.some((sig) => {
    if (!sig) return false;
    const received = Buffer.from(sig.trim().toLowerCase());
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}
```

### Python

```python
import hmac, hashlib

def verify_yapily_webhook(raw_body: bytes, signatures: list, secret: str) -> bool:
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(s.strip().lower().encode(), expected.encode()) for s in signatures if s)
```

See [examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and [examples/fastapi/](../examples/fastapi/) for complete handlers.

## Common Gotchas

- **Raw body.** Yapily says not to map the body to any structure before signing. In Express use `express.raw({ type: '*/*' })`, not `express.json()`. In Next.js use `await request.text()`. In FastAPI use `await request.body()`.
- **Content type.** Don't restrict the raw parser to `application/json`; `type: '*/*'` makes verification independent of the Content-Type Yapily sends.
- **Case.** Compare lowercase hex on both sides.
- **No timestamp.** There is nothing to check for replay protection; make handlers idempotent instead.
- **Secret shown once.** If you didn't store `webhookSecret`, reset it with `POST /webhook/secrets/{webhook_id}`.
- **1-second budget.** Verify, enqueue, and return 200 quickly.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong secret, secret from another application/environment, or body parsed before verifying |
| Fails only for some requests | A rotation is in progress and you only checked `webhook-signature`; or the body was re-serialised |
| `timingSafeEqual` throws | Length mismatch; check lengths first |
| Using a Standard Webhooks library | Not supported; use the HMAC above |
| Header is missing | Request did not come from Yapily, or a proxy stripped it |
