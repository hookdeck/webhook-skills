# How to Verify Hightouch HTTP Request Calls

## How Does Hightouch Authenticate Requests?

It doesn't sign them. There is no HMAC and no timestamp. The HTTP Request destination sends the
headers you configured, so you add a **secret header** (name and value are yours) and your
endpoint checks it:

```
Authorization: Bearer your-shared-secret      # or any header name / value you chose
```

> **A static shared credential authenticates the sender, not the body, and gives no replay
> protection** (no signature, no timestamp). Anyone who captures one request can resend it or
> change the body. Use HTTPS and rotate the credential if it leaks. For stronger guarantees, put
> the endpoint behind a gateway that enforces more than a static header.

## Implementation

Configuration: `HIGHTOUCH_WEBHOOK_HEADER` (default `Authorization`) and
`HIGHTOUCH_WEBHOOK_SECRET` (the exact, whole header value).

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyHightouchRequest(
  headers,
  secret = process.env.HIGHTOUCH_WEBHOOK_SECRET,
  headerName = process.env.HIGHTOUCH_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_hightouch_request(headers, secret=None, header_name=None) -> bool:
    secret = secret or os.environ.get("HIGHTOUCH_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("HIGHTOUCH_WEBHOOK_HEADER") or "Authorization"
    received = {k.lower(): v for k, v in headers.items()}.get(header_name.lower())
    # Encode to bytes: compare_digest raises TypeError on non-ASCII str.
    return bool(secret and received and hmac.compare_digest(received.encode(), secret.encode()))
```

## Common Gotchas

- **Compare the WHOLE value.** If you typed `Bearer abc123` into Hightouch, the secret is
  `Bearer abc123`. Don't strip, lower-case or parse the prefix.
- **Header name is yours.** Look it up case-insensitively (Node lowercases header names).
- **Constant-time compare.** Node: hash both sides (or check lengths) before `timingSafeEqual`,
  which throws on unequal lengths. Python: `hmac.compare_digest` on bytes, never `str`.
- **Fail closed.** If `HIGHTOUCH_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body, then parse.** Use `express.raw({ type: '*/*' })` so any content type is accepted,
  and `JSON.parse` only after the credential check.
- **Any method.** Each trigger picks its own method; accept POST, PUT, PATCH, DELETE (and GET).
- **Empty bodies are valid.** `GET` and empty-payload syncs carry no body.
- **OAuth mode** sends rotating tokens you can't compare to a static secret. Use a secret header.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `HIGHTOUCH_WEBHOOK_SECRET` unset, or `HIGHTOUCH_WEBHOOK_HEADER` doesn't match the header key in Hightouch |
| 401 but the secret "looks right" | The Hightouch value includes `Bearer ` (or not) and your env var doesn't match exactly; check trailing whitespace |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | The body isn't JSON (e.g. an XML or form payload) |
| 405/404 on DELETE or PUT | The route only accepts POST; allow all methods |
