# How to Verify Invoice Ninja Webhook Requests

## How Does Invoice Ninja Authenticate Webhooks?

It doesn't sign them. The `WebhookSingle` job sends the entity as JSON with the headers you
configured on the subscription (a key/value list). You add a secret header there and your
endpoint compares it with the value you stored.

```
X-Webhook-Secret: 9f2c...   # name and value are both your choice
```

There is no HMAC, timestamp or signed body. This mirrors Hookdeck's Invoice Ninja source, which
verifies a header name plus an exact value.

## What This Does and Doesn't Give You

A static shared credential **authenticates the sender, not the body**. There is no signature and
no timestamp, so it gives **no replay protection** and does not prove the body is unmodified. Use
HTTPS only, keep the value out of logs, and rotate it (in Invoice Ninja and your env var) if it
leaks. Make handlers idempotent: see the webhook-handler-patterns skill.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyInvoiceNinjaRequest(
  headers,
  secret = process.env.INVOICE_NINJA_WEBHOOK_SECRET,
  headerName = process.env.INVOICE_NINJA_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_invoice_ninja_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("INVOICE_NINJA_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("INVOICE_NINJA_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False
    received = {k.lower(): v for k, v in headers.items()}.get(header_name.lower())
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return bool(received) and hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Compare the whole value.** If you set `Authorization: Bearer abc123`, the stored secret is
  `Bearer abc123`. Don't strip, split or parse the `Bearer ` prefix.
- **The header name is yours.** Read it from configuration and match case-insensitively.
- **Never answer 404, 405 or 410.** Invoice Ninja deletes the subscription. Bad credentials are
  `401`, bad bodies `400`.
- **A 401 is not retried.** Only connection errors and `429` are retried, so a wrong secret drops
  events. Fix the value and trigger the event again.
- **The method is configurable.** `rest_method` is `post` (default) or `put`, so accept `POST` and `PUT`.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type works, and
  `JSON.parse` only after the credential check.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes.
- **Fail closed.** If `INVOICE_NINJA_WEBHOOK_SECRET` is unset, reject everything.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Env var unset, header name mismatch, or the value differs (check a `Bearer ` prefix and trailing spaces) |
| 401 only behind a proxy | The proxy strips or renames the header (some strip `Authorization`) |
| Events stop arriving | Subscription was deleted after a 404/405/410, or a 401 period dropped them |
| 400 after authentication | Body isn't a JSON object |
| Can't tell which event fired | The body has no event field: use `?event=` per subscription |
