# How to Verify Datto RMM Webhook Requests

## How Does Datto RMM Authenticate Webhooks?

It doesn't sign them. Global Webhooks let you add custom headers (Name and Value). You add a
secret header and your endpoint checks it on every request:

```
<your header name>: <your secret value>
```

There is no HMAC and no timestamp. The body is not part of the check.

> **A static shared credential authenticates the sender, not the body, and gives no replay
> protection** (no signature, no timestamp). Anyone who captures one request can replay it, and
> the body isn't covered. Use HTTPS, keep the secret out of logs, and rotate it in Datto RMM and
> in `DATTO_RMM_WEBHOOK_SECRET` if it leaks. Use idempotency (for example on `alert_uid` plus
> status) to absorb duplicates.

## Implementation

The header name is user-chosen: read it from `DATTO_RMM_WEBHOOK_HEADER` (default
`Authorization`), look it up case-insensitively, and compare the **whole** value with
`DATTO_RMM_WEBHOOK_SECRET`. Do not strip or parse a `Bearer ` prefix.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyDattoRmmRequest(headers, {
  headerName = process.env.DATTO_RMM_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.DATTO_RMM_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_datto_rmm_request(headers, header_name=None, secret=None) -> bool:
    header_name = header_name or os.environ.get("DATTO_RMM_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("DATTO_RMM_WEBHOOK_SECRET")
    if not secret:
        return False
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    if not received:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Use Global Webhooks.** Per-monitor webhooks have no header field, so they can't be verified.
- **Compare the whole value.** If you typed `Bearer abc123` as the header value, the secret is
  `Bearer abc123`.
- **Header name is yours.** Keep `DATTO_RMM_WEBHOOK_HEADER` in sync with what you typed. Names
  are case-insensitive.
- **Fail closed.** If `DATTO_RMM_WEBHOOK_SECRET` is unset, reject everything.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python, pass bytes to `hmac.compare_digest`.
- **Raw body, any content type.** Read it raw (`express.raw({ type: '*/*' })`) and parse after
  the check. The body may be JSON, plain text or form-encoded.
- **No event field.** Dispatch on a field you put in your own template.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret unset, or header name/value differs from what's in Datto RMM |
| 401 with a `Bearer` header | `DATTO_RMM_WEBHOOK_SECRET` omits the `Bearer ` prefix typed in Datto RMM |
| No header at all | A per-monitor webhook is firing (Global Webhooks off) |
| 401 only behind a proxy | The proxy strips or renames the header |
| Test button errors | URL, content type or payload problem; read the message Datto shows |
