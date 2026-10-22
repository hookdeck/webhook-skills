# How to Authenticate Ory Actions Webhook Requests

## How Does Ory Authenticate Webhooks?

Ory does not sign webhook requests: no HMAC, timestamp or signature header. With
`auth.type: api_key` and `in: header`, Ory sends one extra header, `<name>: <value>`, using the
name and value you configured. Authenticate by comparing the received header with the value you
stored.

```
Authorization: your-secret
```

**This authenticates the sender, not the body, and gives no replay protection.** A static shared
credential never changes between requests and nothing ties it to the payload, so anyone who sees
it can replay or forge requests. Use HTTPS, and rotate the credential (update the action and
`ORY_WEBHOOK_SECRET` together) if it leaks. Make handlers idempotent.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyOryRequest(headers, secret = process.env.ORY_WEBHOOK_SECRET,
    headerName = process.env.ORY_WEBHOOK_HEADER || 'Authorization') {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_ory_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("ORY_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("ORY_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)   # Starlette/Flask headers are case-insensitive
    # Encode both sides: compare_digest raises TypeError for non-ASCII str.
    return bool(secret and received) and hmac.compare_digest(
        received.encode("utf-8"), secret.encode("utf-8")
    )
```

## Common Gotchas

- **Compare the whole value.** Don't strip or parse a `Bearer ` prefix. If the action value is
  `Bearer abc`, the expected value is `Bearer abc`.
- **The header name is yours.** It isn't always `Authorization`; read it from `ORY_WEBHOOK_HEADER`
  and look it up case-insensitively.
- **Header only.** `in: cookie` isn't covered.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python, compare bytes, never `str`.
- **Fail closed.** If `ORY_WEBHOOK_SECRET` is unset, reject everything.
- **Any method, any content type.** Accept POST, PUT and PATCH (and tolerate GET with no body).
  Read the body raw (`express.raw({ type: '*/*' })`) and parse after the credential check.
- **Don't send a response that matters.** Non-blocking actions ignore it; return `200` quickly.
- **Rotate on leak.** There is nothing else protecting the endpoint.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `ORY_WEBHOOK_SECRET` unset, or `ORY_WEBHOOK_HEADER` doesn't match the action's `name` |
| 401 but the value looks right | A `Bearer ` prefix typed in the action but missing from the env var (or vice versa) |
| 401 only behind a proxy | The proxy strips or renames the header |
| 405 | The action uses a method other than GET, POST, PUT or PATCH |
| 400 after authentication | A non-empty body that isn't a JSON object; check your Jsonnet template |
