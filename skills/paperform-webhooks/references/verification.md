# How to Verify Paperform Webhook Requests

## How Does Paperform Authenticate Webhooks?

It doesn't sign them. Paperform webhooks carry no HMAC and no timestamp. Instead you enable the
**Custom headers** toggle and add a secret header, and your endpoint checks that header on every
request.

```
X-Webhook-Secret: <the value you typed>
```

The header name and value are entirely yours. This matches how Hookdeck's Paperform source works
(API key verification: header name plus exact value).

## What This Does and Doesn't Protect

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection**: there's no signature over the payload and no timestamp, so anyone who captures one
request can resend it, or send a different body with the same header. Mitigations:

- Use HTTPS only.
- Rotate the credential if it leaks (update both Paperform and your environment).
- Make handlers idempotent on `submission_id` (see webhook-handler-patterns).

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyPaperformRequest(headers, {
  headerName = process.env.PAPERFORM_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.PAPERFORM_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_paperform_request(headers, header_name=None, secret=None) -> bool:
    header_name = header_name or os.environ.get("PAPERFORM_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("PAPERFORM_WEBHOOK_SECRET")
    if not secret:
        return False
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    if not received:
        return False
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Compare the whole value.** If the header is `Bearer abc`, the secret is `Bearer abc`. Don't
  strip or parse a `Bearer ` prefix.
- **Header names are case-insensitive.** Look up `x-webhook-secret` the same as `X-Webhook-Secret`.
- **Constant-time compare.** Node: hash both sides (or check lengths) before `timingSafeEqual`,
  which throws on unequal lengths. Python: `hmac.compare_digest` on `bytes`; `str` raises
  `TypeError` on non-ASCII.
- **Fail closed.** If `PAPERFORM_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the check.
- **No piping in headers.** Custom header values don't support Answer Piping; they're literal.
- **Respond fast.** Paperform times out after about 10 seconds.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `PAPERFORM_WEBHOOK_SECRET` unset, or the Custom headers toggle is off |
| 401 with the right secret | `PAPERFORM_WEBHOOK_HEADER` doesn't match the header name typed in Paperform |
| 401 only with `Bearer` | The secret omits the `Bearer ` prefix typed in Paperform |
| 401 only behind a proxy | The proxy strips or renames the custom header |
| 400 after authentication | Body isn't a JSON object with a `data` array |
