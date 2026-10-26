# How to Verify Rebrandly Webhook Requests

## How Does Rebrandly Authenticate Webhooks?

It doesn't sign them. Rebrandly adds the authentication header you configured (header key and
value). There is no HMAC, timestamp or event-type header.

```
<your-header-name>: <your-header-value>
```

**A static shared credential authenticates the sender, not the body, and gives no replay
protection** (no signature, no timestamp). Anyone who captures a request can replay it. Use HTTPS,
and rotate the credential if it leaks. Matches Hookdeck's Rebrandly source: API key verification
with Header Name plus the exact whole Header Value.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function verifyRebrandlyRequest(headers, secret = process.env.REBRANDLY_WEBHOOK_SECRET,
    headerName = process.env.REBRANDLY_WEBHOOK_HEADER || 'Authorization') {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received.length > 0 && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_rebrandly_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("REBRANDLY_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("REBRANDLY_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)
    if not (secret and received):
        return False
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Compare the whole value.** Don't strip or parse a `Bearer ` prefix; it is part of the secret.
- **Header name varies.** Rebrandly's blog shows `X-Rebrandly-Secret` and `apikey`. Capture a real
  delivery and set `REBRANDLY_WEBHOOK_HEADER` to what arrives. Look it up case-insensitively.
- **Every method.** Clickstream uses POST or PUT; check the credential first for all methods.
- **Constant-time compare.** Node: check lengths, then `timingSafeEqual` on equal-length Buffers.
  Python: `hmac.compare_digest` on bytes; never `str`, which raises on non-ASCII.
- **Fail closed.** If `REBRANDLY_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`), parse after the check, and accept an
  empty body.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret unset, or wrong `REBRANDLY_WEBHOOK_HEADER` name |
| 401 but the value looks right | A `Bearer ` prefix was dropped from (or added to) the secret |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a JSON object, or `data` isn't an array |
