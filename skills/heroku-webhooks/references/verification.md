# Heroku Signature Verification

## How Does Heroku Sign Webhooks?

- Header: `Heroku-Webhook-Hmac-SHA256`
- Algorithm: HMAC-SHA256
- Signed content: the **raw request body**, nothing else (no timestamp, no ID)
- Encoding: **base64** (not hex)
- Key: the webhook secret as a raw string

Heroku's own sample (Rails) base64-encodes the digest and uses `Rack::Utils.secure_compare`. It publishes no Node or Python sample and no verification SDK, so the examples verify manually.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyHerokuWebhook(rawBody, hmacHeader, secret) {
  if (!hmacHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import base64, hashlib, hmac

def verify_heroku_webhook(raw_body: bytes, hmac_header, secret) -> bool:
    if not hmac_header or not secret:
        return False
    expected = base64.b64encode(
        hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(hmac_header.encode(), expected.encode())
```

## Common Gotchas

- **Use the raw body.** Parsing and re-serializing JSON changes bytes. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Base64, not hex.** Comparing against a hex digest always fails.
- **Don't base64-decode the secret.** Unlike Standard Webhooks `whsec_` secrets, Heroku's is used as typed.
- **Lost secrets can't be recovered.** If the generated secret wasn't saved, run `heroku webhooks:update` and deploy the new value.
- **`Authorization` is not the signature.** It's only the optional `--authorization` value, passed through unmodified; validate it separately.
- **No replay protection.** There is no timestamp header, so make handlers idempotent using the event `id`.
- **Respond 2xx.** Any 2xx is success; `204` is recommended. On `sync` subscriptions a non-2xx causes retries and delays later events.

## Debugging Verification Failures

1. Run `heroku webhooks:deliveries` to see status and `heroku webhooks:deliveries:info DELIVERY_ID` for the stored event.
2. Confirm the secret matches the one from `webhooks:add` / `webhooks:update` (no trailing newline from shell or `.env`).
3. Log `req.body.length` and confirm it is a Buffer / bytes, not a parsed object.
4. Check that no proxy or middleware rewrites the body.
5. If you receive 401s, check `HEROKU_WEBHOOK_AUTHORIZATION` matches `--authorization` exactly.
