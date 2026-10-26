# How to Verify Payrix Pro Webhook Requests

## How Does Payrix Pro Authenticate Webhooks?

It doesn't sign them. Each webhook action can carry a header name and value ("Header Value: Any
value displayed in the webhook header, including authentication or other security flags."). You
set a secret there and check it on arrival.

```
X-Payrix-Secret: your-secret          (any header name you chose)
Authorization: Bearer abc123          (also fine: compare the whole value)
```

There is no HMAC, timestamp or prefix parsing. The body is not part of the check.

## What This Check Does Not Give You

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp). Anyone who captures one request can replay it or alter the body in
transit. Use HTTPS only, treat the value like a password, rotate it if it leaks, and make handlers
idempotent.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const hb = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyPayrixProRequest(
  headers,
  secret = process.env.PAYRIX_PRO_WEBHOOK_SECRET,
  headerName = process.env.PAYRIX_PRO_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_payrix_pro_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("PAYRIX_PRO_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("PAYRIX_PRO_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)
    if not (secret and received):
        return False
    # bytes, never str: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Compare the whole value.** If the Header Value is `Bearer abc123`, `PAYRIX_PRO_WEBHOOK_SECRET`
  must be `Bearer abc123`. Don't strip or parse the prefix. This matches Hookdeck's Payrix Pro
  source (Header Name + exact whole Header Value).
- **Every action needs the header.** Actions without one send nothing to verify.
- **Every method.** Check the credential first for GET, POST, PUT, PATCH and DELETE alike.
- **Empty bodies.** Some requests may have no body; don't fail on that.
- **Constant-time compare.** Node: hash both sides (or check lengths) before `timingSafeEqual`,
  which throws on unequal lengths. Python: `compare_digest` on bytes.
- **Fail closed.** If `PAYRIX_PRO_WEBHOOK_SECRET` is unset, reject everything.
- **Read the body raw** (`express.raw({ type: '*/*' })`) so any content type is accepted, and parse
  only after the check.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret unset, wrong header name, or action has no header configured |
| 401 only with `Bearer` values | Secret stored without the `Bearer ` prefix |
| 401 only on some requests | Another action on the alert has no header set |
| 401 behind a proxy | The proxy strips or renames the header |
| 405/404 at Hookdeck | Source doesn't allow the method Payrix used (only POST is pre-selected) |
| 400 after authentication | Content-Type says JSON but the body isn't valid JSON |
