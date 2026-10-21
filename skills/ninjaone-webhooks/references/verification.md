# How to Verify NinjaOne Webhooks

## Does NinjaOne Sign Webhooks?

No. The NinjaOne API v2 spec describes no signature header, signing secret, timestamp or
HMAC for webhooks. There's nothing to compute a signature from. Don't write an HMAC
verifier for NinjaOne.

## How Does NinjaOne Webhook Authentication Work?

You set a custom header on the webhook through `PUT /v2/webhook` (`headers`, documented
as "Custom HTTP Headers (i.e. Authorization)"). NinjaOne sends it unchanged on each delivery.
Your endpoint checks that it matches the secret you chose.

| Item | Value |
|------|-------|
| Header | `X-Webhook-Secret` (any name you choose; `Authorization` also works) |
| Expected value | The value of `NINJAONE_WEBHOOK_SECRET` |
| Algorithm | Constant-time equality of the whole header value. No hashing scheme from NinjaOne |
| Signed content | None |
| Raw body needed? | No |
| Timestamp / replay window | None |
| Console-created webhooks | Can't carry a header, so can't be authenticated |

If you use `Authorization` instead, set the whole value (for example `Bearer <secret>`)
and compare the whole string.

## Implementation

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyNinjaOneSecret(headerValue, secret) {
  if (!secret) return false; // fail closed
  if (typeof headerValue !== 'string') return false;
  const a = crypto.createHash('sha256').update(headerValue).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}
```

- Express: `req.headers['x-webhook-secret']` (Node lowercases header names).
- Next.js App Router: `request.headers.get('x-webhook-secret')`, which returns `null` when absent.

Hashing both sides with SHA-256 gives `timingSafeEqual` equal-length inputs, so a wrong-length
header returns `false` instead of throwing.

### Python (FastAPI)

```python
import hmac

def verify_ninjaone_secret(header_value, secret):
    if not secret or header_value is None:
        return False  # fail closed
    return hmac.compare_digest(header_value.encode(), secret.encode())
```

FastAPI maps the `X-Webhook-Secret` header to a parameter named `x_webhook_secret`:
`x_webhook_secret: Optional[str] = Header(default=None)`.

## Common Gotchas

- **Don't use `==`.** A plain string comparison can leak timing information. Use
  `timingSafeEqual` / `compare_digest`.
- **Fail closed.** If `NINJAONE_WEBHOOK_SECRET` is unset, reject everything (the examples
  return `500`). Comparing `undefined` to a missing header would otherwise let anyone in.
- **`PUT` replaces the config.** Re-sending `PUT /v2/webhook` without `headers` removes
  the secret header and your endpoint starts returning `401`.
- **No body integrity.** Anyone who learns the secret can forge events, and a captured
  request can be replayed. Use HTTPS, rotate the secret if it leaks, and deduplicate on
  `id` + `statusCode`.
- **Rotating the secret.** Update the endpoint and re-run `PUT /v2/webhook` together. Accept
  both the old and new value briefly if you can't change both at once.
- **Don't log the header.** It's a credential.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `401` on every delivery | Header not set in `PUT /v2/webhook`, a different header name, or a stale secret |
| `401` only after you changed settings | A later `PUT /v2/webhook` omitted `headers` |
| Deliveries never carry a header | The webhook was created in the console, not through the API |
| `500` from your endpoint | `NINJAONE_WEBHOOK_SECRET` isn't loaded in the server environment |

Inspect what NinjaOne actually sent with `npx hookdeck-cli listen 3000 ninjaone --path /webhooks/ninjaone`.
