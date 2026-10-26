# How to Verify Requests from a Tray.io Workflow

## How Does Tray.io Authenticate Requests?

It doesn't sign them. The HTTP Client connector sends whatever headers you configure, so the
authentication is a secret header you add yourself:

```
Authorization: Bearer your-secret      # header name and value are your choice
```

Your endpoint compares the **whole header value** with the value it has stored.

**A static shared credential authenticates the sender, not the body.** There is no signature and no
timestamp, so a modified body can't be detected and a captured request can be replayed. Mitigate by
using HTTPS only, rotating the credential if it leaks, and making handlers idempotent.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyTrayRequest(headers, {
  headerName = process.env.TRAY_IO_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.TRAY_IO_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  if (typeof received !== 'string' || !received) return false;
  return safeEqual(Buffer.from(received, 'latin1'), Buffer.from(secret, 'utf8'));
}
```

### Python

```python
import hmac, os

def verify_tray_request(headers, header_name=None, secret=None) -> bool:
    header_name = header_name or os.environ.get("TRAY_IO_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("TRAY_IO_WEBHOOK_SECRET")
    if not secret:
        return False
    received = headers.get(header_name)          # Starlette headers are case-insensitive
    if not received:
        return False
    # Starlette decodes header bytes as latin-1; re-encode to recover the original bytes.
    return hmac.compare_digest(received.encode("latin-1"), secret.encode("utf-8"))
```

## Common Gotchas

- **Compare the whole value.** If the workflow sends `Bearer abc`, `TRAY_IO_WEBHOOK_SECRET` is
  `Bearer abc`. Don't strip or parse the prefix.
- **Header name is yours.** Read it from `TRAY_IO_WEBHOOK_HEADER` and match case-insensitively.
- **Bytes, not str, in Python.** `hmac.compare_digest` raises `TypeError` on a non-ASCII `str`;
  encode both sides first.
- **Constant-time compare.** `timingSafeEqual` throws on unequal lengths, so hash both sides (or
  check lengths) first.
- **Fail closed.** If the secret is unset, reject everything.
- **Any method.** Accept `POST`, `PUT`, `PATCH`, `DELETE` and `GET`, and accept an empty body.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the credential check. Tray defaults to `application/x-www-form-urlencoded` when
  no body type is chosen, which the examples reject as non-JSON (400).
- **Don't hard-code the credential in the step.** Use `$.auth` so Tray obscures it in logs.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `TRAY_IO_WEBHOOK_SECRET` unset, or the header name differs from `TRAY_IO_WEBHOOK_HEADER` |
| 401 with a `Bearer` header | The stored secret omits the `Bearer ` prefix the workflow sends |
| 401 began after rotating | Tray's authentication and the server value are out of sync |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't JSON (check the HTTP Client body type) or isn't a JSON object |
