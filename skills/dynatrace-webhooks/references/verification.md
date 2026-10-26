# How to Verify Dynatrace Webhook Requests

## How Does Dynatrace Authenticate Webhooks?

It doesn't sign them. There is no HMAC and no timestamp. Authenticate with a secret header that
you add as an **Additional HTTP header** on the integration. Both the header name and value are
yours, so read them from configuration:

```
<DYNATRACE_WEBHOOK_HEADER>: <DYNATRACE_WEBHOOK_SECRET>
```

Look the header up case-insensitively and compare the **whole** value. If you typed
`Bearer abc123`, the expected value is `Bearer abc123`; do not strip or parse the prefix.
Hookdeck's Dynatrace source does the same (header name plus exact whole value).

**Send the secret in a custom header, not as a token in the webhook URL.**

## What This Does and Doesn't Protect

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp). Anyone who captures one request can replay it or send
altered bodies. Use HTTPS, and rotate the credential in Dynatrace and in your environment if it
leaks.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyDynatraceRequest(headers,
    name = process.env.DYNATRACE_WEBHOOK_HEADER || 'Authorization',
    secret = process.env.DYNATRACE_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    # compare_digest on bytes; never pass str (raises TypeError on non-ASCII)
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_dynatrace_request(headers, name=None, secret=None) -> bool:
    name = name or os.environ.get("DYNATRACE_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("DYNATRACE_WEBHOOK_SECRET")
    received = {k.lower(): v for k, v in headers.items()}.get(name.lower())
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Compare the whole value.** Don't strip `Bearer `; the configured value is the full header.
- **Header name is yours.** If you change it in Dynatrace, change `DYNATRACE_WEBHOOK_HEADER`.
- **No secret in the URL.** Hookdeck can't verify a URL token, and URLs leak into logs.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes.
- **Fail closed.** If `DYNATRACE_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) since the template may be JSON, text
  or XML; parse only after the check.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret unset, or header name differs from `DYNATRACE_WEBHOOK_HEADER` |
| 401 with correct secret | The env value omits or adds a `Bearer ` prefix compared with the Dynatrace header |
| 401 only behind a proxy | The proxy strips or renames the custom header |
| Cannot tell opened from resolved problems | Template lacks `{State}` |
