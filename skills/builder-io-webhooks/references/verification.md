# How to Authenticate Builder.io Webhook Requests

## How Does Builder.io Authenticate Webhooks?

It doesn't sign them. Builder.io lets you add a **custom header** to each webhook (**+ Custom
Header**: a name and a value). Authenticate a request by looking up that header and comparing its
whole value with the secret you stored. This is the same check Hookdeck's Builder.io source does:
header name plus exact value.

```
X-Builder-Secret: your-long-random-value
```

- `BUILDER_IO_WEBHOOK_HEADER`: the header name you chose (default `Authorization`).
- `BUILDER_IO_WEBHOOK_SECRET`: the exact, whole header value, including any `Bearer ` prefix you
  typed. Don't strip or parse the prefix; compare the full string.

**A static shared credential authenticates the sender, not the body, and gives no replay
protection** (there is no signature and no timestamp). Anyone who captures one request can resend
it. Use HTTPS, keep the credential out of logs, and rotate it in Builder.io and your environment if
it leaks. Make handlers idempotent.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function verifyBuilderRequest(headers, {
  header = process.env.BUILDER_IO_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.BUILDER_IO_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false;
  const received = headers[header.toLowerCase()];
  return typeof received === 'string' && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_builder_request(headers, header=None, secret=None) -> bool:
    header = header or os.environ.get("BUILDER_IO_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("BUILDER_IO_WEBHOOK_SECRET")
    received = headers.get(header)  # Starlette headers are case-insensitive
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Compare the whole value.** If the custom header value is `Bearer abc123`, the secret is
  `Bearer abc123`. Don't strip the prefix.
- **Case-insensitive header lookup.** Node lowercases header names, so lowercase the configured
  name; `Headers.get` (Next.js) and Starlette (FastAPI) are already case-insensitive.
- **Constant-time compare.** Check lengths before `crypto.timingSafeEqual`, which throws on unequal
  lengths. In Python encode both sides to bytes before `hmac.compare_digest`.
- **Fail closed.** If `BUILDER_IO_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, and
  `JSON.parse` only after the check.
- **Per-webhook headers.** The header lives on each webhook entry. A webhook with no custom header
  will always get 401.
- **Disable proxy.** With **Disable proxy** on, requests come from the editor's browser, not
  Builder's backend. Use it only for local development.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret unset, wrong header name, or the webhook has no custom header |
| 401 only with a `Bearer ` value | Secret env var lacks the `Bearer ` prefix typed in Builder |
| 401 began suddenly | The header value was edited or rotated in Builder |
| 401 only behind a proxy | The proxy strips or renames the header (common for `Authorization`) |
| 400 after authentication | Body isn't a JSON object |
