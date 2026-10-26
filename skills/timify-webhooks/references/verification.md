# How to Verify TIMIFY Webhook Requests

## How Does TIMIFY Authenticate Webhooks?

TIMIFY does not sign payloads. There is no HMAC, signature header or timestamp. When you enable
**Include header name** on a webhook subscription, TIMIFY adds the custom HTTP header and secret
value you entered to every request:

```
<your-header-name>: <your-secret-value>
```

The header name is user-chosen, so it is read from `TIMIFY_WEBHOOK_HEADER` (default
`Authorization`). The expected value is `TIMIFY_WEBHOOK_SECRET`: the exact, whole header value,
including any `Bearer ` prefix you typed. Compare the whole value; do not strip or parse a
`Bearer ` prefix. This is the check Hookdeck's TIMIFY source performs (API key verification: header
name plus exact whole header value).

## What Does This Not Protect Against?

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp). Anyone who can read a request, or who learns the value, can send
or replay requests. Use HTTPS only, keep the secret out of logs, and rotate the credential (edit
the subscription and update `TIMIFY_WEBHOOK_SECRET`) if it leaks. Make handlers idempotent.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyTimifyRequest(headers, secret = process.env.TIMIFY_WEBHOOK_SECRET,
                             name = process.env.TIMIFY_WEBHOOK_HEADER || 'Authorization') {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_timify_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("TIMIFY_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("TIMIFY_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(secret and received) and hmac.compare_digest(
        received.encode("utf-8"), secret.encode("utf-8")  # bytes, never str
    )
```

Respond `401` when the header is missing or doesn't match.

## Common Gotchas

- **Compare the whole value.** Don't strip `Bearer `; the secret is whatever you typed.
- **Header name is yours.** Read it from `TIMIFY_WEBHOOK_HEADER`; look it up case-insensitively.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python pass bytes to `hmac.compare_digest`; `str` raises on
  non-ASCII.
- **Fail closed.** If `TIMIFY_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the check.
- **Sync webhooks.** Before Confirmations and Before Reminders expect a synchronous answer and
  aren't supported.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `TIMIFY_WEBHOOK_SECRET` unset, or **Include header name** is off so TIMIFY sends no header |
| 401, header is present | Value differs: a `Bearer ` prefix typed in one place only, or trailing whitespace |
| 401 with a custom header name | `TIMIFY_WEBHOOK_HEADER` doesn't match the name in the subscription |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a JSON object |
