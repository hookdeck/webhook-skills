# How to Verify Fireberry Webhook Requests

## How Does Fireberry Authenticate Webhooks?

It doesn't sign them. There is no HMAC, signature header or timestamp. The webhook action sends the
header key/value pairs you configured, so the way to authenticate is a **secret header** you add
yourself and compare on your endpoint:

```
Authorization: Bearer your-long-random-secret
```

The header name is your choice, so the examples read it from `FIREBERRY_WEBHOOK_HEADER` (default
`Authorization`) and the expected value from `FIREBERRY_WEBHOOK_SECRET`. This matches what Hookdeck's
Fireberry source does: API key verification with a header name and the exact value.

> **What this does and doesn't give you.** A static shared credential authenticates the **sender**,
> not the body, and gives **no replay protection** (no signature, no timestamp). Anyone who captures
> one request can resend it. Use HTTPS, keep the secret out of logs, and rotate it (edit the header in
> the action and update `FIREBERRY_WEBHOOK_SECRET`) if it leaks.

## Implementation

Compare the **whole** header value, case-insensitive on the name only. Do not strip or parse a
`Bearer ` prefix.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function verifyFireberryRequest(
  headers,
  secret = process.env.FIREBERRY_WEBHOOK_SECRET,
  headerName = process.env.FIREBERRY_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def safe_equal(a: str, b: str) -> bool:
    # bytes, not str: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_fireberry_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("FIREBERRY_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("FIREBERRY_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Don't strip `Bearer `.** If you typed `Bearer abc` as the value, `FIREBERRY_WEBHOOK_SECRET` must
  be `Bearer abc`. Comparing only `abc` will fail.
- **Header name is yours.** There is no fixed Fireberry header. Keep `FIREBERRY_WEBHOOK_HEADER` in
  sync with the key in the action.
- **Any method, empty body.** The action can use POST, GET, PUT, DELETE or PATCH, and GET has no
  body. Accept all five and treat an empty body as valid. Authenticate before looking at the body.
- **Hookdeck source pre-selects POST.** Hookdeck's Fireberry source pre-selects POST only, so a
  non-POST automation needs that method allowed on the source.
- **Constant-time compare.** Check lengths before `timingSafeEqual` (it throws on unequal lengths)
  or hash both sides. In Python encode both sides to bytes.
- **Fail closed.** If `FIREBERRY_WEBHOOK_SECRET` is unset, reject every request.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type works, and
  `JSON.parse` only after the credential check.
- **401s can disable the automation.** Consecutive error responses set the automation to Draft.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `FIREBERRY_WEBHOOK_SECRET` unset, or the header key/value differs from the action |
| 401, secret looks right | `Bearer ` prefix omitted from the env value, or `FIREBERRY_WEBHOOK_HEADER` doesn't match |
| 401 only behind a proxy | The proxy strips or renames the custom header |
| Works for POST, not GET/PUT | The method isn't allowed on the Hookdeck source, or your route is POST-only |
| 400 after authenticating | Body isn't a JSON object (check the Body box in the action) |
| Automation turned to Draft | Repeated error responses; fix the cause and re-activate |
