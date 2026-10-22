# How to Verify Sendbird Webhook Signatures

## How Does Sendbird Sign Webhooks?

Sendbird sends `x-sendbird-signature`: the **hex-encoded HMAC-SHA256 of the raw request body**, keyed with your application's **master API token**. There is no timestamp and no prefix; the signed content is the body alone. No Sendbird SDK helper exists for verifying webhooks, so verification is manual.

> Always use the master API token. Secondary API tokens won't work. The master token is a full-access credential, so keep it server-side.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifySendbirdWebhook(rawBody, signatureHeader, apiToken) {
  if (!signatureHeader || !apiToken) return false;
  const expected = crypto.createHmac('sha256', apiToken).update(rawBody).digest('hex');
  const received = Buffer.from(signatureHeader.trim().toLowerCase());
  const expectedBuf = Buffer.from(expected);
  return received.length === expectedBuf.length && crypto.timingSafeEqual(received, expectedBuf);
}
```

### Python

```python
import hmac, hashlib

def verify_sendbird_webhook(raw_body: bytes, signature_header, api_token) -> bool:
    if not signature_header or not api_token:
        return False
    expected = hmac.new(api_token.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.strip().lower().encode(), expected.encode())
```

## Common Gotchas

- **Use `x-sendbird-signature`, not `x-signature`.** The legacy `x-signature` header never matches when the body contains non-ASCII characters (emoji, accented text), and Sendbird says it may be deprecated.
- **Use the raw body.** In Express use `express.raw({ type: '*/*' })` so any content type is captured as a Buffer; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Master token only.** A secondary token produces a different digest.
- **No replay protection.** There is no timestamp, so make handlers idempotent (retries resend the same payload up to three times).
- **Respond within 5 seconds** with `200`, and process asynchronously.

## Debugging Verification Failures

1. Confirm `SENDBIRD_API_TOKEN` is the master token of the same application that sends the webhook.
2. Log the length of the raw body and make sure no middleware (`express.json()`, `request.json()`) consumed or re-serialized it.
3. Check you read `x-sendbird-signature`, not `x-signature`.
4. If a proxy sits in front of your handler, confirm it does not alter the body.
