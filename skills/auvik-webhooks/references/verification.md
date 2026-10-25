# How to Verify Auvik Webhook Requests

## How Does Auvik Authenticate Webhooks?

Auvik does not sign payloads. With **Header** authentication, every request carries the custom
header you configured (Key and Value). Compare it with the value you stored.

```
<AUVIK_WEBHOOK_HEADER>: <AUVIK_WEBHOOK_SECRET>
```

There is no HMAC, timestamp or algorithm. The header name is user-chosen, so read it from
`AUVIK_WEBHOOK_HEADER` (default `Authorization`) and look it up case-insensitively. Compare the
**whole** value with `AUVIK_WEBHOOK_SECRET`; if you typed `Bearer abc` in Auvik, the secret is
`Bearer abc`. Do not strip or parse a prefix. This matches Hookdeck's Auvik source (header name
plus exact whole value).

## What This Does and Doesn't Protect

A static shared credential authenticates the **sender**, not the **body**. It gives no replay
protection (no signature, no timestamp): anyone who captures one request can resend it, and the
body can't be checked for tampering. Use HTTPS, keep the value secret, rotate it if it leaks, and
make handlers idempotent (e.g. dedupe on `alertId` + `alertStatusString` + `date`).

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyAuvikRequest(headers,
    name = process.env.AUVIK_WEBHOOK_HEADER || 'Authorization',
    secret = process.env.AUVIK_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    # Encode to bytes: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_auvik_request(headers, name=None, secret=None) -> bool:
    name = name or os.environ.get("AUVIK_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("AUVIK_WEBHOOK_SECRET")
    received = headers.get(name)  # Starlette headers are case-insensitive
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Choose Header authentication, not OAuth.** Basic Authentication and OAuth 2.0 are not covered.
- **Compare the whole value.** Don't strip `Bearer `; it is part of the stored secret.
- **Header names are case-insensitive.** Node lowercases them; `Headers.get()` and Starlette
  handle it for you.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes.
- **Fail closed.** If `AUVIK_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the credential check.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `AUVIK_WEBHOOK_SECRET` unset, or differs from the Value in Auvik (check `Bearer ` prefix and whitespace) |
| 401 and the header is present | `AUVIK_WEBHOOK_HEADER` doesn't match the Key in Auvik |
| 401 only behind a proxy | The proxy strips or rewrites the header (some replace `Authorization`) |
| 401 after rotating | Auvik and the env var weren't changed together |
| 400 after authentication | Body isn't a JSON object (e.g. a JSONata expression returned something else) |
