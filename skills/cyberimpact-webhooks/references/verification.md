# How to Verify Cyberimpact Webhook Requests

## How Does Cyberimpact Authenticate Webhooks?

Cyberimpact does not sign payloads. There is no HMAC and no timestamp header. Instead the
scenario author adds a key-value pair to the **Headers** of the Send a webhook action, and
Cyberimpact sends it with every request. Your endpoint holds the same value and compares.

```
Authorization: your-secret-value
```

The header name is whatever the author typed. This skill reads it from
`CYBERIMPACT_WEBHOOK_HEADER` (default `Authorization`) and the expected value from
`CYBERIMPACT_WEBHOOK_SECRET`.

**Use a simple header name without spaces or special characters, such as `Authorization`.**

> **A static shared credential authenticates the sender, not the body, and gives no replay
> protection** (no signature, no timestamp). Anyone who captures one request can replay it or
> send a different body with the same header. Use HTTPS, and rotate the credential in both the
> scenario and your endpoint if it leaks. Use the event `id` for idempotency.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyCyberimpactRequest(headers, {
  name = process.env.CYBERIMPACT_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.CYBERIMPACT_WEBHOOK_SECRET,
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
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_cyberimpact_request(headers, name=None, secret=None) -> bool:
    name = name or os.environ.get("CYBERIMPACT_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("CYBERIMPACT_WEBHOOK_SECRET")
    received = headers.get(name.lower())
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Compare the whole value.** If the author typed `Bearer abc123`, the header is exactly
  `Bearer abc123` and `CYBERIMPACT_WEBHOOK_SECRET` must be the same string. Don't strip or parse
  a `Bearer ` prefix.
- **Header names are case-insensitive.** Look the header up lowercased (Node and Starlette
  already lowercase incoming names).
- **Simple header name.** Cyberimpact rejects keys with spaces or special characters. Use
  `Authorization`.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python, compare bytes, never `str`.
- **Fail closed.** If `CYBERIMPACT_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  parse JSON after the credential check.
- **Answer 200.** The Test button counts only `200` as accepted. Non-accepted requests are
  retried for 12 hours.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `CYBERIMPACT_WEBHOOK_SECRET` unset, or differs from the header value in the scenario |
| 401 and the header is present | `CYBERIMPACT_WEBHOOK_HEADER` doesn't match the key, or the `Bearer ` prefix is missing from the env value |
| 401 only behind a proxy | The proxy strips or renames the header (some proxies drop `Authorization`) |
| 400 after authentication | Body isn't a JSON object |
