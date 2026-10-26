# How to Verify Tripletex Webhook Requests

## How Does Tripletex Authenticate Webhooks?

Tripletex does not sign payloads. There is no HMAC and no timestamp. The recommended option is the
custom authentication header: the `authHeaderName` and `authHeaderValue` you set on the event
subscription "will be sent as-is for every webhook POST callback". For example
`{"authHeaderName": "Authorization", "authHeaderValue": "Bearer abc123"}` makes every webhook carry
`Authorization: Bearer abc123`.

Your endpoint authenticates a request by comparing that header with the value you stored.

**A static shared credential authenticates the sender, not the body, and gives no replay
protection.** Anyone who sees a request can resend it. Use HTTPS, keep the value long and random,
make handlers idempotent, and rotate the credential (`PUT /event/subscription/{id}` with a new
`authHeaderValue`, then update `TRIPLETEX_WEBHOOK_SECRET`) if it leaks.

## Implementation

The header name is chosen by you, so the examples read it from `TRIPLETEX_WEBHOOK_HEADER` (default
`Authorization`) and the expected value from `TRIPLETEX_WEBHOOK_SECRET`. Compare the **whole**
value, exactly as typed. Do not strip or parse a `Bearer ` prefix.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyTripletexRequest(
  headers,
  secret = process.env.TRIPLETEX_WEBHOOK_SECRET,
  headerName = process.env.TRIPLETEX_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_tripletex_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("TRIPLETEX_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("TRIPLETEX_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Compare the whole value.** If `authHeaderValue` was `Bearer abc123`, the secret is
  `Bearer abc123`. Don't strip the prefix, and don't accept a bare `abc123`.
- **Header names are case-insensitive.** Node lowercases `req.headers` keys; `Headers.get` and
  Starlette handle case for you.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python pass bytes to `hmac.compare_digest`; `str` raises
  `TypeError` on non-ASCII.
- **Fail closed.** If `TRIPLETEX_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the check.
- **Header is optional in Tripletex.** A subscription created without `authHeaderName` /
  `authHeaderValue` sends nothing to verify and your endpoint would reject it. Set both.
- **Unsupported options.** Basic credentials in the `targetUrl` and `?token=` parameters are not
  covered here.
- **Retries.** A failed delivery is retried over 30 hours, so return `401` only for real auth
  failures and make handlers idempotent.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `TRIPLETEX_WEBHOOK_SECRET` unset, or the subscription has no `authHeaderName` / `authHeaderValue` |
| 401 with the right secret | `Bearer ` prefix missing from the stored secret, or `TRIPLETEX_WEBHOOK_HEADER` differs from `authHeaderName` |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a JSON object |
| Deliveries stopped | Subscription is `DISABLED_TOO_MANY_ERRORS`; fix the endpoint and `PUT` it back to `ACTIVE` |
