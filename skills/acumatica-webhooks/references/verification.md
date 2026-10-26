# How to Authenticate Acumatica Webhook Requests

## How Does Acumatica Authenticate Webhooks?

It doesn't sign them. There is no HMAC, no signature header and no timestamp. The Webhook
destination on the Push Notifications form (SM302000) has **Header Name** and **Header Value**
boxes ("for security reasons, you can specify a header of the HTTP request"), and Acumatica adds
that header to every POST. You verify by comparing the received header with the value you stored.

```
<Header Name>: <Header Value>
```

Because the name is chosen by the user, read it from `ACUMATICA_WEBHOOK_HEADER` (default
`Authorization`) and compare the **whole** received value with `ACUMATICA_WEBHOOK_SECRET`. If the
value is `Bearer abc123`, the secret is `Bearer abc123`; do not strip or parse the prefix.

## What This Does and Doesn't Protect

A static shared credential authenticates the **sender**, not the body, and gives **no replay
protection** (no signature, no timestamp). Anyone who captures one request can replay it, and the
body can't be proven unchanged. Mitigate with:

- HTTPS only, so the header can't be read in transit
- A long random value, rotated in Acumatica and in `ACUMATICA_WEBHOOK_SECRET` if it leaks
- Idempotency on the notification `Id`, so a replayed or retried notification is harmless

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function verifyAcumaticaRequest(headers, env = process.env) {
  const secret = env.ACUMATICA_WEBHOOK_SECRET;
  if (!secret) return false;
  const name = (env.ACUMATICA_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[name];
  return typeof received === 'string' && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_acumatica_request(headers, env=os.environ) -> bool:
    secret = env.get("ACUMATICA_WEBHOOK_SECRET")
    if not secret:
        return False
    name = env.get("ACUMATICA_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(name)  # Starlette headers are case-insensitive
    return received is not None and safe_equal(received, secret)
```

## Common Gotchas

- **Compare the whole value.** Don't split off `Bearer `; Hookdeck's Acumatica source compares the
  header name and exact whole value too.
- **Header names are case-insensitive.** Node lowercases them; look up `name.toLowerCase()`.
- **Constant-time compare.** `timingSafeEqual` throws on unequal lengths, so check lengths first.
  In Python pass bytes to `hmac.compare_digest`; `str` raises on non-ASCII.
- **Fail closed.** If `ACUMATICA_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the header check.
- **Don't reply with errors for good requests.** Acumatica resends on error (up to five attempts),
  which produces duplicates. Dedupe on `Id`.
- **Reserved headers.** Don't use `Accept` or `Content-Type` as the custom header.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `ACUMATICA_WEBHOOK_SECRET` unset, or the header name differs from `ACUMATICA_WEBHOOK_HEADER` |
| 401 and the value looks right | Missing or extra `Bearer ` prefix: it must match the Header Value exactly |
| 401 only behind a proxy | The proxy strips or renames the custom header (`Authorization` is commonly rewritten) |
| 401 after rotating the value | Updated Acumatica but not the environment variable, or the reverse |
| 400 after authentication | Body isn't a JSON object |
