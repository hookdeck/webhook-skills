# How to Authenticate Firstbase Webhook Requests

## Does Firstbase Sign Webhooks?

No. There is no HMAC, signature header or timestamp. With **Custom header** authentication,
Firstbase sends the header name and value you entered with every request. Use Custom header
authentication, not Auth token or OAuth.

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp). Anyone who captures a request can resend it. Use HTTPS,
make handlers idempotent, and rotate the credential if it leaks.

## Implementation

The header name comes from `FIRSTBASE_WEBHOOK_HEADER` (default `Authorization`) and is looked up
case-insensitively. The expected value is `FIRSTBASE_WEBHOOK_SECRET`, the exact whole header
value. Do not strip or parse a `Bearer ` prefix.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyFirstbaseRequest(headers,
    name = process.env.FIRSTBASE_WEBHOOK_HEADER || 'Authorization',
    secret = process.env.FIRSTBASE_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_firstbase_request(headers, header_name=None, secret=None) -> bool:
    header_name = header_name or os.environ.get("FIRSTBASE_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("FIRSTBASE_WEBHOOK_SECRET")
    received = headers.get(header_name)  # Starlette/Flask headers are case-insensitive
    if not secret or not received:
        return False
    # bytes, never str: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Compare the whole value.** If you typed `Bearer abc` in Firstbase, the expected value is
  `Bearer abc`, not `abc`.
- **Header names are case-insensitive.** Node lowercases them; use `headers.get()` in the Fetch
  API and Starlette.
- **Constant-time compare.** `timingSafeEqual` throws on unequal lengths, so hash both sides (or
  check lengths first). Python `compare_digest` needs bytes.
- **Fail closed.** If `FIRSTBASE_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the credential check.
- **Return codes.** `401` for a missing or wrong header, `400` for a body that isn't a JSON object,
  any `2xx` once handled.
- **Not Auth token or OAuth.** Only Custom header authentication is covered.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `FIRSTBASE_WEBHOOK_SECRET` unset, or header name differs from `FIRSTBASE_WEBHOOK_HEADER` |
| 401 with the right secret | A `Bearer ` prefix typed in Firstbase is missing from the env value (or vice versa) |
| 401 only behind a proxy | The proxy strips or renames the custom header |
| 401 after rotating | Firstbase and `FIRSTBASE_WEBHOOK_SECRET` hold different values |
| 400 after authentication | Body isn't a JSON object |
