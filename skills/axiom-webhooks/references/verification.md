# How to Authenticate Axiom Webhook Requests

## How Does Axiom Authenticate Webhooks?

It doesn't, on its own. Axiom does not sign payloads and sends no timestamp. The Custom webhook
notifier lets you add headers to the `POST`; you add a secret header and your endpoint checks it.

```
Authorization: Bearer your-token      # header name and value are your choice
```

> Use the Custom webhook notifier with a secret header. The plain Webhook notifier cannot send one.

**What this does and doesn't give you.** A static shared credential authenticates the sender, not
the body, and gives no replay protection (no signature, no timestamp). Anyone who captures a
request can replay it, and the body is not tamper-evident. Use HTTPS, make handlers idempotent, and
rotate the credential if it leaks.

## Implementation

The header name is user-chosen, so read it from `AXIOM_WEBHOOK_HEADER` (default `Authorization`)
and the expected value from `AXIOM_WEBHOOK_SECRET`. Look the header up case-insensitively and
compare the **whole** value. Do not strip or parse a `Bearer ` prefix.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyAxiomRequest(headers, {
  name = process.env.AXIOM_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.AXIOM_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_axiom_request(headers, name=None, secret=None) -> bool:
    name = name or os.environ.get("AXIOM_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("AXIOM_WEBHOOK_SECRET")
    received = headers.get(name)  # Starlette headers are case-insensitive
    if not secret or not received:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Plain Webhook notifier.** It sends no custom headers, so there is nothing to check. Switch to
  the Custom webhook notifier.
- **Whole value.** If the notifier sends `Authorization: Bearer abc`, `AXIOM_WEBHOOK_SECRET` is
  `Bearer abc`, not `abc`.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `compare_digest` on bytes.
- **Fail closed.** If `AXIOM_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the credential check.
- **Edited templates.** The body is yours, so a template that renders invalid JSON (for example an
  unescaped quote in `.Body`) produces a `400` here after authentication succeeds.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `AXIOM_WEBHOOK_SECRET` unset, or the notifier is the plain Webhook type |
| 401, header is present | Value differs: missing `Bearer ` prefix, trailing space, wrong header name |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a JSON object, often a template quoting problem |
