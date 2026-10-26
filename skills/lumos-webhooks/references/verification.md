# How to Authenticate Lumos Webhook Requests

## How Does Lumos Authenticate Webhooks?

Lumos lets you add custom headers to any webhook, "for example a bearer token or an API key
that your endpoint expects". Your endpoint compares that header with the value you stored.
This is also how Hookdeck's Lumos source verifies requests: a header name plus the exact, whole
header value.

```
Authorization: Bearer your-secret-value
```

The header name is yours to choose. The value is compared whole, including any `Bearer ` prefix.

## Why Isn't the Lumos Signature Verified?

Lumos also signs each request: HMAC-SHA256 over a timestamp plus the request body, with a
per-webhook signing secret, sent in `X-Lumos-Webhook-Signature` (signature and timestamp travel
together). The header format and sample code are in a separate "Verifying Webhook Signatures"
help article that is behind a login, so this skill can't verify the format and **does not verify
that signature**. If you have access to that article, you can add signature verification on top
of the header check.

## What Does a Static Header Not Protect Against?

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection** (no signature, no timestamp): anyone who captures one request can resend it, or send
a different body with the same header. Mitigate it:

- Serve the endpoint over HTTPS only (Lumos requires it).
- Rotate the credential if it leaks (change it in Lumos and in `LUMOS_WEBHOOK_SECRET`).
- Optionally allowlist Lumos's fixed source IP addresses.
- Make handlers idempotent.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function verifyLumosRequest(headers,
    name = process.env.LUMOS_WEBHOOK_HEADER || 'Authorization',
    secret = process.env.LUMOS_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_lumos_request(headers, header_name=None, secret=None) -> bool:
    header_name = header_name or os.environ.get("LUMOS_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("LUMOS_WEBHOOK_SECRET")
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Compare the whole value.** Don't strip or parse a `Bearer ` prefix; `LUMOS_WEBHOOK_SECRET`
  holds exactly what you typed in Lumos.
- **Case-insensitive header name.** Node lowercases incoming header names; `Headers.get` and
  Starlette are already case-insensitive.
- **Constant-time compare.** `timingSafeEqual` throws on unequal lengths, so check lengths
  first. In Python encode both sides to bytes; `compare_digest` raises `TypeError` on a
  non-ASCII `str`.
- **Fail closed.** If `LUMOS_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type works, then
  `JSON.parse` after the header check.
- **No redirects.** Lumos doesn't follow them; a redirecting endpoint fails the delivery.
- **Wrong webhook types.** Pre-Approval and Request Validation need a decision in the response.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `LUMOS_WEBHOOK_SECRET` unset, or `LUMOS_WEBHOOK_HEADER` doesn't match the header name in Lumos |
| 401 but the secret looks right | Missing `Bearer ` prefix (or an extra one) in `LUMOS_WEBHOOK_SECRET`; the whole value must match |
| 401 only behind a proxy | The proxy strips or renames the custom header |
| Delivery fails with no request | The URL is HTTP, redirects, or resolves to a private address |
| 400 after authentication | Body isn't a JSON object |
