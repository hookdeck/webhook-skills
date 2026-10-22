# How to Verify Checkly Webhook Signatures

## How It Works

When a webhook secret is configured, Checkly computes `HMAC-SHA256(secret, rendered_body)` and sends the lowercase hex digest in the `x-checkly-signature` header. Nothing else is signed. The format is just the hex string, with no `sha256=` prefix and no timestamp component.

`x-checkly-timestamp` is also sent, but it is **not** part of the signed content, so an attacker can alter it. Use it only for ordering and for ignoring late deliveries, never as proof of freshness.

## Implementation

Checkly publishes no SDK for receiving webhooks, so all examples verify manually.

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

With Express, read the body as raw bytes for every content type:

```javascript
app.post('/webhooks/checkly', express.raw({ type: '*/*' }), (req, res) => { /* req.body is a Buffer */ });
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

- **Use the raw body.** Checkly's own Node sample calls `JSON.stringify(request.body)`, which only matches if your template renders compact JSON with the same key order. Verifying the raw bytes always works.
- **The secret is optional.** With no secret there is no signature header. Reject requests with a missing header rather than skipping verification.
- **The body is user-defined.** It can be JSON, form data or plain text, so don't restrict the content type when reading the raw body.
- **Whitespace and escaping.** Handlebars HTML-escapes `{{VAR}}` values; the signature covers whatever was actually rendered.
- **Unsigned timestamp.** Don't treat `x-checkly-timestamp` as authenticated. Retries re-send the same payload, so make handlers idempotent instead of enforcing a tight window.
- **Retries.** A response above 399 triggers up to 5 retries, 20 seconds apart.

## Debugging Verification Failures

1. Confirm a webhook secret is set on the alert channel, and that it matches `CHECKLY_WEBHOOK_SECRET` exactly (no trailing newline).
2. Check that your framework isn't parsing and re-serializing the body before verification.
3. Check a proxy isn't modifying the body or stripping the header.
4. Log the received header and your computed digest from a test message, and compare.
