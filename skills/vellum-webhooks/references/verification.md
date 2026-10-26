# How to Verify Vellum Webhook Requests

## How Does Vellum Authenticate Webhooks?

Vellum Monitoring webhooks are unsigned. You add a secret header with **API Key Header** or
**Bearer Token** authentication, and your endpoint compares that header with the value you stored.

```
<VELLUM_WEBHOOK_HEADER>: <VELLUM_WEBHOOK_SECRET>
```

For Bearer Token that is `Authorization: Bearer <token>`. The comparison covers the **whole header
value**; don't strip or parse a `Bearer ` prefix.

Vellum can also sign requests with HMAC (`X-Vellum-Timestamp`, `X-Vellum-Signature` over
timestamp, method, URL and body). Hookdeck's Vellum source doesn't check it, and this skill
doesn't either.

> **A static shared credential authenticates the sender, not the body, and gives no replay
> protection** (no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyVellumRequest(
  headers,
  secret = process.env.VELLUM_WEBHOOK_SECRET,
  headerName = process.env.VELLUM_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: bytes, b: bytes) -> bool:
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())

def verify_vellum_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("VELLUM_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("VELLUM_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)  # case-insensitive in Starlette
    if not (secret and received):
        return False
    return safe_equal(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Compare the whole value.** If you configured Bearer Token, `VELLUM_WEBHOOK_SECRET` is
  `Bearer <token>`, not `<token>`.
- **Case-insensitive header name.** Look it up case-insensitively (Node lowercases names).
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes; `str` raises on
  non-ASCII.
- **Fail closed.** If `VELLUM_WEBHOOK_SECRET` is unset, reject everything.
- **Every method.** The HTTP method isn't documented, so check the credential before anything
  else for GET, POST, PUT, PATCH and DELETE.
- **Raw body, empty body.** Read it raw (`express.raw({ type: '*/*' })`), parse only after the
  check, and return `200` for an empty body.
- **No replay protection.** Dedupe on the event `id` and make handlers idempotent.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `VELLUM_WEBHOOK_SECRET` unset, or missing the `Bearer ` prefix |
| 401 with a custom header | `VELLUM_WEBHOOK_HEADER` doesn't match the name set in Vellum |
| 401 only behind a proxy | The proxy strips or renames the credential header |
| Vellum sends but nothing arrives in Hookdeck | The source only allows POST; allow the method Vellum uses |
| 400 after authentication | Body isn't a JSON object |
