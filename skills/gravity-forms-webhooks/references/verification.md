# How to Authenticate Gravity Forms Webhooks

## Does Gravity Forms Sign Webhooks?

No. The
[Webhooks Add-On docs](https://docs.gravityforms.com/triggering-webhooks-form-submissions/)
describe no signature header, signing secret, timestamp or HMAC. Anything claiming to
verify a "Gravity Forms signature" is made up and will reject every real delivery.

## What Can I Verify Instead?

The feed's **Request Headers** setting. Add a header with a secret value that only your
feed and your server know, then check it on every request. The docs don't name the
header, so this skill uses `X-Webhook-Secret`.

| Item | Value |
|------|-------|
| Header | `X-Webhook-Secret` (your choice; override with `GRAVITY_FORMS_WEBHOOK_HEADER`) |
| Value | The random secret you generated, sent as-is |
| Algorithm | None. Constant-time equality of the header value |
| What it covers | Proves the sender knows the secret. Does not cover the body |
| Env var | `GRAVITY_FORMS_WEBHOOK_SECRET` |

Serve the endpoint over HTTPS only, since the secret travels in a header.

## Implementation

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyGravityFormsSecret(headerValue, secret) {
  if (!secret) return false;
  if (typeof headerValue !== 'string') return false;
  const a = crypto.createHash('sha256').update(headerValue).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}
```

Hashing both sides first means `timingSafeEqual` never throws on a length mismatch and
doesn't leak the secret's length.

### Python (FastAPI)

```python
import hmac

def verify_gravity_forms_secret(header_value, secret):
    if not secret or header_value is None:
        return False
    return hmac.compare_digest(header_value.encode(), secret.encode())
```

## Common Gotchas

- **Don't use `==`.** Plain string comparison leaks timing. Use `timingSafeEqual` or
  `hmac.compare_digest`.
- **Fail closed.** If the secret isn't set on your server, return `500` (or reject);
  don't skip the check.
- **Check before parsing.** The examples read the body only after the header passes.
- **Body format varies.** `Request Format` `JSON` sends JSON; `FORM` sends urlencoded.
  Don't assume JSON without checking `Content-Type`. A `JSON` feed with a method other
  than `POST` or `PUT` doesn't get an automatic `Content-Type: application/json`.
- **Don't add the header on the wrong feed.** Headers are per feed. A form with several
  webhook feeds needs the header on each one.
- **Select Fields has no `id`.** Without a mapped `id`, you can't deduplicate.
- **Header name case doesn't matter.** Express (`req.get`), `Headers.get` and Starlette
  look headers up case-insensitively.

## How Do I Debug Authentication Failures?

| Symptom | Likely cause |
|---------|--------------|
| `401` on every delivery | Header name or value in the feed doesn't match the server's; check for stray whitespace |
| `500` from your handler | `GRAVITY_FORMS_WEBHOOK_SECRET` isn't set in the server environment |
| No request arrives | Request URL fails WordPress validation (custom port, redirect), the condition didn't match, or the site can't reach your host |
| `400` after the secret passes | Body isn't valid JSON (check Request Format vs the handler) |
