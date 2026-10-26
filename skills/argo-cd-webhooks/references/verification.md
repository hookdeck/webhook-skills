# How to Verify Argo CD Webhook Requests

## How Does Argo CD Authenticate Webhooks?

It doesn't sign them. The notifications engine sets every header configured on the webhook
service (`service.webhook.<name>.headers`) on each request. Add a secret header there and compare
it with the value you stored.

```
Authorization: Bearer your-shared-secret
```

The header name is user-chosen. The examples read it from `ARGO_CD_WEBHOOK_HEADER` (default
`Authorization`) and the expected **whole** value from `ARGO_CD_WEBHOOK_SECRET`. This matches
Hookdeck's Argo CD source, which uses API key verification with a header name and the exact
header value. A missing header or a mismatch is `401`.

**A static shared credential authenticates the sender, not the body, and gives no replay
protection** (no signature, no timestamp). Use HTTPS, and rotate the credential if it leaks.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyArgoCdRequest(
  headers,
  secret = process.env.ARGO_CD_WEBHOOK_SECRET,
  headerName = process.env.ARGO_CD_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest()
    )

def verify_argo_cd_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("ARGO_CD_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("ARGO_CD_WEBHOOK_HEADER") or "Authorization"
    received = {k.lower(): v for k, v in headers.items()}.get(header_name.lower())
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **GET by default.** Argo CD sends `GET` unless the template sets a method, and GET has no body.
  Accept every method the template can choose (GET, POST, PUT, PATCH), check the credential
  first, and handle an empty body.
- **Compare the whole value.** Do not strip or parse a `Bearer ` prefix. If you typed
  `Bearer abc` in the secret, `ARGO_CD_WEBHOOK_SECRET` is `Bearer abc`.
- **Case-insensitive header lookup.** Node lowercases header names; the Python helper lowercases both sides and
  `Headers` is case-insensitive.
- **`basicAuth` isn't covered by Hookdeck's Argo CD source.** Use a header.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes, never `str`, which
  raises on non-ASCII.
- **Fail closed.** If `ARGO_CD_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted,
  then `JSON.parse` after the credential check.
- **Retries.** Argo CD retries network errors and 5xx responses, so handlers should be idempotent.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `ARGO_CD_WEBHOOK_SECRET` unset, or the header name differs from `ARGO_CD_WEBHOOK_HEADER` |
| 401 with the right secret | Missing or extra `Bearer ` prefix compared with what the Secret holds |
| Request arrives with no body | Template has no `method`, so Argo CD sent GET |
| 405 from Hookdeck or your server | The method (GET, PUT, PATCH) isn't allowed on the source or route |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a JSON object (check the template's `body`) |
