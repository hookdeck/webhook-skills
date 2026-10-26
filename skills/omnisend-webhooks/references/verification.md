# How to Verify Omnisend Webhook Requests

## How Does Omnisend Authenticate Webhooks?

It doesn't sign them. There is no HMAC, timestamp or message ID. The Omnisend docs offer two ways
to check a request comes from Omnisend:

1. **Shared secret header**: add a custom header (for example `X-Webhook-Secret`) to the webhook
   action and validate it on your server. This skill implements this.
2. **IP allowlist**: requests come from `34.170.162.11`, `34.56.62.59`, `34.56.108.215`,
   `34.133.59.36`, `34.58.66.146`, `35.184.130.5` and `35.232.14.89`. Useful as an extra layer,
   but behind proxies the source IP is often hidden.

## What a Shared Credential Does and Doesn't Give You

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection** (no signature, no timestamp): anyone who captures one request can resend it, or send
a different body with the same header. Use HTTPS (Omnisend requires it), keep the secret out of
logs, and **rotate the credential if it leaks** (update the action's header and your env var
together). Make handlers idempotent.

## Implementation

The header name is user-chosen. Read it from `OMNISEND_WEBHOOK_HEADER` (default `X-Webhook-Secret`)
and compare the **whole** value with `OMNISEND_WEBHOOK_SECRET`.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyOmnisendRequest(headers, {
  headerName = process.env.OMNISEND_WEBHOOK_HEADER || 'X-Webhook-Secret',
  secret = process.env.OMNISEND_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && safeEqual(received, secret);
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

def verify_omnisend_request(headers, header_name=None, secret=None) -> bool:
    header_name = header_name or os.environ.get("OMNISEND_WEBHOOK_HEADER") or "X-Webhook-Secret"
    secret = secret or os.environ.get("OMNISEND_WEBHOOK_SECRET")
    wanted = header_name.lower()  # case-insensitive lookup
    received = next((v for k, v in headers.items() if k.lower() == wanted), None)
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Header name is yours.** Omnisend doesn't send a fixed one. Match the name in the action
  (case-insensitively).
- **Compare the whole value.** If the value is `Bearer abc`, the secret is `Bearer abc`. Don't
  strip or parse a prefix.
- **Fail closed.** If `OMNISEND_WEBHOOK_SECRET` is unset, reject everything.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths; encode both sides to bytes for `hmac.compare_digest`.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the credential check.
- **No event field by default.** The body is your template; add `event` yourself.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret env var unset, or header name differs from the action's |
| 401, header present | Value mismatch: stray whitespace, or `Bearer ` prefix in one place only |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | The body template doesn't render to a JSON object |
