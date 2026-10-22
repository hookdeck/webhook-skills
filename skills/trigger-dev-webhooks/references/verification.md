# How to Verify Trigger.dev Webhook Signatures

## How It Works

Trigger.dev sends one signature header:

| Header | Value |
|--------|-------|
| `x-trigger-signature-hmacsha256` | Lowercase hex HMAC-SHA256 digest |

- **Signed content:** the raw request body, exactly as received
- **Key:** the alert webhook secret, used as a UTF-8 string (not base64-decoded, no prefix to strip)
- **Encoding:** bare hex, with no `sha256=` prefix
- **No timestamp or message ID** is signed, so there is no built-in replay window. Use the payload `id` for idempotency.

## Implementation

### SDK Verification (Node.js)

```typescript
import { webhooks, WebhookError } from "@trigger.dev/sdk";

try {
  // request is a Web Request; the SDK reads request.text() and the signature header
  const event = await webhooks.constructEvent(request, process.env.TRIGGER_DEV_WEBHOOK_SECRET!);
  switch (event.type) {
    case "alert.run.failed": /* ... */ break;
    case "alert.deployment.success": /* ... */ break;
    case "alert.deployment.failed": /* ... */ break;
    case "alert.error": /* ... */ break;
  }
} catch (err) {
  if (err instanceof WebhookError) {
    // missing header, invalid signature, or unparseable payload
    return new Response(err.message, { status: 400 });
  }
  throw err;
}
```

`constructEvent` also accepts `{ payload, header }` instead of a `Request`. The SDK's `Request` form consumes the body, so call it before anything else reads it.

### Manual Verification (Node.js)

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Manual Verification (Python)

```python
import hmac, hashlib

def verify(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.encode(), expected.encode())
```

## Common Gotchas

- **Use the raw body.** Re-serialized JSON changes whitespace and key order, so the digest will not match. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Accept any content type.** `express.raw({ type: 'application/json' })` skips other content types and leaves `req.body` empty. `type: '*/*'` avoids that.
- **Secret is a plain string.** Do not base64-decode it or strip a prefix.
- **Compare timing-safe, and guard length.** `crypto.timingSafeEqual` throws on unequal lengths; catch and return false.
- **The event type is in the body**, as `type`, not in a header.

## Debugging Verification Failures

- **Always invalid:** check you are using the secret from the Alerts page of the right project, and that an env var is not trailing a newline or quotes.
- **Invalid only in production:** a proxy, middleware or framework body parser is altering the body before your handler. Verify against the untouched bytes.
- **Signature header missing:** the request did not come from Trigger.dev, or a proxy stripped the header. Header names are case-insensitive; Node lowercases them.
- **Compare by hand:** `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET"` should print the same hex digest as the header.
