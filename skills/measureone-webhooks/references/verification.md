# How to Authenticate MeasureOne Webhook Requests

## How Does MeasureOne Authenticate Webhooks?

MeasureOne does not sign payloads: there is no HMAC, signature header or timestamp. Instead you add a
static header to `delivery_details[].headers` on each Data Request, and your endpoint checks that
header. The header name is chosen by you, so read it from `MEASUREONE_WEBHOOK_HEADER` (default
`Authorization`). The expected value is `MEASUREONE_WEBHOOK_SECRET`, the exact whole value
including any `Bearer ` prefix you typed.

```
X-Webhook-Secret: Bearer your-shared-secret
```

Lookup is case-insensitive; the comparison is on the **whole** value. Do not strip or parse a
`Bearer ` prefix. This is also what Hookdeck's MeasureOne source does (API key verification:
Header Name plus exact whole Header Value).

## What This Does and Doesn't Protect

A static shared credential **authenticates the sender, not the body**, and gives **no replay
protection** (no signature, no timestamp). Anyone who captures a request can resend it. Use HTTPS,
rotate the credential if it leaks, and make handlers idempotent.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyMeasureOneRequest(headers, secret = process.env.MEASUREONE_WEBHOOK_SECRET,
    headerName = process.env.MEASUREONE_WEBHOOK_HEADER || 'Authorization') {
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

def verify_measureone_request(headers, secret=None, header_name=None) -> bool:
    secret = secret or os.environ.get("MEASUREONE_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("MEASUREONE_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Compare the whole value.** If you typed `Bearer abc`, the secret is `Bearer abc`. Stripping the
  prefix on one side and not the other is the usual cause of 401s.
- **Header name is yours.** Don't hard-code one; read `MEASUREONE_WEBHOOK_HEADER`.
- **Put the header on every `delivery_details` entry.** An entry without it arrives unauthenticated.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which throws
  on unequal lengths. In Python use `hmac.compare_digest` on bytes; a `str` with non-ASCII raises.
- **Fail closed.** If `MEASUREONE_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the check.
- **JWT and Basic.** The JWT option fetches a new token for every delivery and cannot be checked;
  Basic is not covered by Hookdeck's MeasureOne source.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret unset, wrong header name, or the header wasn't added to `delivery_details[].headers` |
| 401 with the right secret | `Bearer ` prefix missing from one side; whole value must match |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a JSON object |
