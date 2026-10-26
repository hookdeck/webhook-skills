# How to Verify Opsgenie Webhook Requests

## How Does Opsgenie Authenticate Webhooks?

It doesn't, by itself. Opsgenie webhooks have no signature, no timestamp and no built-in secret.
The Webhook integration lets you add **custom headers** to each call. You add one whose name and
value only you and Opsgenie know, and your endpoint checks it:

```
X-Opsgenie-Secret: 7f3c9e...            (any header name you chose)
Authorization: Bearer 7f3c9e...         (or Authorization, whole value compared as typed)
```

## What Does a Shared Secret Give You?

A static shared credential authenticates the **sender**, not the body, and gives **no replay
protection** (no signature, no timestamp). Someone who captures one request, or learns the secret,
can send any body or replay it. So:

- Use HTTPS only.
- Make handlers idempotent (see webhook-handler-patterns).
- Rotate the credential if it leaks: change it in Opsgenie and in `OPSGENIE_WEBHOOK_SECRET`.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function verifyOpsgenieRequest(headers,
    headerName = process.env.OPSGENIE_WEBHOOK_HEADER || 'Authorization',
    secret = process.env.OPSGENIE_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_opsgenie_request(headers, header_name=None, secret=None) -> bool:
    header_name = header_name or os.environ.get("OPSGENIE_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("OPSGENIE_WEBHOOK_SECRET")
    received = headers.get(header_name.lower())
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Header name is yours.** It's whatever you typed in Opsgenie. Look it up case-insensitively
  (Node lowercases names; Next.js `Headers` and Starlette headers are case-insensitive).
- **Compare the whole value.** Don't strip or parse a `Bearer ` prefix. `Bearer abc` and `abc` are
  different secrets.
- **Constant-time compare.** In Node check lengths, then `crypto.timingSafeEqual` on equal-length
  Buffers. In Python use `hmac.compare_digest` on **bytes**: passing `str` raises `TypeError` for
  non-ASCII.
- **Fail closed.** If `OPSGENIE_WEBHOOK_SECRET` is unset, reject everything rather than comparing
  against `undefined`.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the credential check.
- **Custom actions.** `action` can be any name you defined; don't 400 on unknown values.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `OPSGENIE_WEBHOOK_SECRET` unset, or custom header missing from the integration |
| 401 with the header present | `OPSGENIE_WEBHOOK_HEADER` doesn't match the name in Opsgenie, or the value differs (e.g. `Bearer ` prefix, trailing space) |
| 401 only behind a proxy | The proxy strips or renames the header |
| 401 began suddenly | Someone changed the header value in Opsgenie |
| 400 after authentication | Body isn't a JSON object |
