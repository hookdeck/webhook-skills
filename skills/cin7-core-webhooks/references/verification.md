# How to Verify Cin7 Core Webhook Requests

## How Does Cin7 Core Authenticate Webhooks?

Cin7 Core does not sign payloads. There is no HMAC and no timestamp. It sends the header you configured when creating the webhook: `authorization: Bearer <token>` (`bearerauth`) or a custom header from `ExternalHeaders`. Your endpoint compares that header with the value you stored. This is also what Hookdeck's Cin7 Core source does: header name plus exact whole value.

> A static shared credential authenticates the **sender**, not the **body**, and gives **no replay protection** (no signature, no timestamp). Use HTTPS, and rotate the credential if it leaks.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyCin7CoreRequest(headers, {
  name = process.env.CIN7_CORE_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.CIN7_CORE_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )
```

## Common Gotchas

- **Compare the whole value.** Do not strip or parse `Bearer `; the secret is the exact header value you typed.
- **Header names are case-insensitive.** Look the configured name up case-insensitively.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which throws on unequal lengths. In Python, `hmac.compare_digest` on `str` raises on non-ASCII, so encode to bytes.
- **Fail closed.** If `CIN7_CORE_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then parse after the check.
- **Basic auth.** `basicauth` is not covered by Hookdeck's Cin7 Core source; use Bearer or `ExternalHeaders`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret unset, or header name differs from `CIN7_CORE_WEBHOOK_HEADER` |
| 401 with Bearer auth | Secret is missing the `Bearer ` prefix |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a JSON object |
| Webhook stopped firing | 6 failed attempts deactivated it; re-activate |
