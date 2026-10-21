# How to Verify Marketo Webhooks

## Does Marketo Sign Webhooks?

No. Marketo's webhook documentation lists URL, Request Type, Payload Template,
Request Token Encoding, Response Type and Custom Headers. It doesn't mention a
signature, HMAC, signing secret, timestamp header or IP allowlist. Don't
look for `X-Marketo-Signature` or similar. It doesn't exist.

That means the request body can't be proven to come from Marketo by a
cryptographic signature. The standard pattern is a **shared secret in a custom
header**, which Marketo supports directly.

## How Does the Shared Secret Pattern Work?

1. Generate a long random value: `openssl rand -hex 32`.
2. In **Admin → Webhooks**, open the webhook and choose **Webhook Actions → Set
   Custom Header**. Add `X-Webhook-Secret` with that value.
3. In your handler, read the header and compare it to your stored copy using a
   constant-time comparison, **before** you parse the body.

Authentication method: a custom API-key style header. Marketo's docs show no
Basic Auth or OAuth option on the webhook itself.

## Implementation

### Node.js (Express)

```javascript
const crypto = require('crypto');

function verifyMarketoSecret(headerValue) {
  const expected = process.env.MARKETO_WEBHOOK_SECRET;
  if (!expected) throw new Error('MARKETO_WEBHOOK_SECRET is not set'); // fail closed
  if (typeof headerValue !== 'string') return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python (FastAPI)

```python
import hmac, os

def verify_marketo_secret(header_value: str | None) -> bool:
    expected = os.environ.get("MARKETO_WEBHOOK_SECRET")
    if not expected:
        raise RuntimeError("MARKETO_WEBHOOK_SECRET is not set")  # fail closed
    if header_value is None:
        return False
    return hmac.compare_digest(header_value.encode(), expected.encode())
```

No SDK is involved: Marketo has no webhook verification helper. The Next.js
route uses the same comparison. See the runnable examples in
[../examples/express/](../examples/express/), [../examples/nextjs/](../examples/nextjs/)
and [../examples/fastapi/](../examples/fastapi/).

## Common Gotchas

- **Compare in constant time.** Use `crypto.timingSafeEqual` or
  `hmac.compare_digest`, not `===`. In Node, check lengths first because
  `timingSafeEqual` throws on a mismatch.
- **Fail closed.** If the secret isn't configured, return `500`, not `200`.
- **Header names are case-insensitive.** Express's `req.get()`, Starlette's
  `request.headers` and `Headers.get()` all handle that.
- **There's no timestamp.** A captured request can be replayed, so make handlers
  idempotent (see
  [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)).
- **Use HTTPS only.** The secret is in a header and is readable by anything that
  sees plaintext traffic.
- **Don't put tokens in the secret header.** Custom headers can contain tokens,
  but a token's value changes per lead, so the value you compare wouldn't be
  stable.
- **Raw body.** Nothing is signed, so the raw body isn't needed for
  verification. The examples still read the raw body and parse JSON after the
  secret check, so the order is explicit.
- **Rotating the secret.** Edit the custom header in Marketo and update
  `MARKETO_WEBHOOK_SECRET` together. Webhooks called in between get a `401`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---|---|
| `401` on every request | Header name differs from `MARKETO_WEBHOOK_HEADER` (default `X-Webhook-Secret`), or the value has extra whitespace |
| `500` on every request | `MARKETO_WEBHOOK_SECRET` isn't set in the app's environment |
| `400 Invalid JSON` | Token value broke the JSON template, or Request Token Encoding is Form/Url |
| `400 Missing event field` | The Payload Template has no `event` entry |
| No request arrives | The campaign isn't active, the lead didn't match the Smart List, or the flow step doesn't call this webhook |

## What About Hookdeck?

Hookdeck's **Marketo** source type verifies the same header for you. See
[setup.md](setup.md#using-hookdeck-in-production).
