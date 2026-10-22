# How to Verify Todoist Webhook Signatures

## How It Works

- Header: `X-Todoist-Hmac-SHA256`
- Algorithm: HMAC-SHA256, output **base64** encoded
- Key: your app's OAuth `client_secret` (not a separate webhook secret)
- Signed content: the whole raw request body (no timestamp or delivery ID is included)

No official Todoist SDK helper exists for webhook verification, so use the manual approach.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyTodoistWebhook(rawBody, signatureHeader, clientSecret) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', clientSecret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import base64, hashlib, hmac

def verify_todoist_webhook(raw_body: bytes, signature_header: str, client_secret: str) -> bool:
    if not signature_header:
        return False
    expected = base64.b64encode(
        hmac.new(client_secret.encode(), raw_body, hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(signature_header.encode(), expected.encode())
```

## Common Gotchas

- **Raw body**: sign the exact bytes received. In Express use `express.raw({ type: '*/*' })` so any content type stays a Buffer; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Key is the client secret**, not an access token or a separate webhook secret. Rotating the client secret changes the key.
- **Base64, not hex**.
- **No timestamp**: the signature does not protect against replay. Deduplicate with `X-Todoist-Delivery-ID`; retries reuse the same ID.
- **Status codes**: return 400 for an invalid signature and 200 on success. Any non-200 is retried by Todoist.
- **Length mismatch**: `timingSafeEqual` throws on different lengths; catch it and return false.

## Debugging Verification Failures

1. Confirm `TODOIST_CLIENT_SECRET` matches the app that owns the webhook (dev vs prod apps).
2. Log the raw body length; if a body parser or proxy re-serialised JSON, it will differ.
3. Compute the HMAC locally for a captured request (Hookdeck CLI shows the raw body) and compare.
4. Check for whitespace or quotes in the env var value.
