# How to Verify Plunk Webhook Requests

## How Does Plunk Authenticate Webhooks?

It doesn't sign them. A workflow Webhook step sends a plain HTTP request with optional custom
headers. Plunk's advice is to configure a secret header on the step and check it on your
endpoint. The header name and value are yours:

```json
{ "Authorization": "Bearer your-shared-secret" }
```

There is no HMAC, no timestamp and no signed body.

**What this does and doesn't give you.** A static shared credential authenticates the sender, not
the body. It gives **no replay protection** (no signature, no timestamp): anyone who captures one
request can resend it, or send different content with the same header. Use HTTPS, keep the secret
out of logs, and rotate it if it leaks. Make the handler idempotent.

## Implementation

Compare the **whole** header value. Do not strip or parse a `Bearer ` prefix: put exactly what you
typed in Plunk into `PLUNK_WEBHOOK_SECRET`. Look the header up case-insensitively.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function verifyPlunkRequest(headers, secret = process.env.PLUNK_WEBHOOK_SECRET,
                            headerName = process.env.PLUNK_WEBHOOK_HEADER || 'Authorization') {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_plunk_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("PLUNK_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("PLUNK_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)   # Starlette headers are case-insensitive
    if not secret or not received:
        return False
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Check every method.** The step can use `GET`, `POST`, `PUT`, `PATCH` or `DELETE`. Authenticate
  before reading the body, whatever the method, and accept an empty body.
- **Static value only.** Header values support `{{variable}}`, but the secret must be a fixed
  string, otherwise there is nothing to compare against.
- **Whole value, no parsing.** `Bearer abc` and `abc` are different secrets.
- **Constant-time compare.** Node: check lengths, then `crypto.timingSafeEqual` on equal-length
  Buffers. Python: `hmac.compare_digest` on bytes (encode both sides; `str` raises on non-ASCII).
- **Fail closed.** If `PLUNK_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`), then `JSON.parse` after the check.
  Custom bodies may be empty or any JSON.
- **No retries.** Plunk doesn't retry a failed request, so a wrongly returned 401 loses the event.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `PLUNK_WEBHOOK_SECRET` unset, or `PLUNK_WEBHOOK_HEADER` doesn't match the header name on the step |
| 401 only when `Bearer ` is involved | The env var holds the token without the `Bearer ` prefix typed in Plunk, or the reverse |
| Non-POST requests never arrive | The Hookdeck source only allows `POST`; allow the step's method on the source |
| 401 with a `{{...}}` in the value | A variable was used in the secret; Plunk sends the interpolated value, which changes |
| 401 only behind a proxy | The proxy strips or renames the secret header |
| 400 after authentication | Body isn't valid JSON (a custom body may not be JSON-shaped as you expect) |
