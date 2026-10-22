# How to Verify Railway Webhook Requests

## How Does Railway Authenticate Webhooks?

It doesn't sign them. Railway's docs say webhook payloads are not cryptographically signed and
tell you to add a custom header with a secret value, then reject any request that doesn't carry
it. Railway sends custom headers with every delivery and with **Test Webhook**.

```
X-Webhook-Secret: your-long-random-token
```

or

```
Authorization: Bearer your-long-random-token
```

There is no HMAC, timestamp or algorithm to verify. Compare the header you configured with the
value you stored.

## Security Limits of This Check

A static shared credential authenticates the **sender**, not the **body**. There is no signature
over the payload and no timestamp, so:

- a request body can't be proven unmodified;
- there is **no replay protection**: anyone who captures one valid request can resend it.

Mitigate with HTTPS only, idempotent handling (see webhook-handler-patterns), and rotating the
header value in Railway and your environment if it may have leaked. Railway values are
write-only, so rotate by saving a new value.

## Implementation

The header name is user-chosen, so read it from `RAILWAY_WEBHOOK_HEADER` (default
`Authorization`) and the expected value from `RAILWAY_WEBHOOK_SECRET`. Look the header up
case-insensitively and compare the **whole** value. Do not strip or parse a `Bearer ` prefix.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyRailwayRequest(
  headers,
  secret = process.env.RAILWAY_WEBHOOK_SECRET,
  headerName = process.env.RAILWAY_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

Express: `app.post('/webhooks/railway', express.raw({ type: '*/*' }), handler)`, call
`verifyRailwayRequest(req.headers)` first, then `JSON.parse(req.body.toString('utf8'))`.

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_railway_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("RAILWAY_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("RAILWAY_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)  # Starlette/Django headers are case-insensitive
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Whole-value compare.** If you typed `Bearer abc123` in Railway, the stored value is
  `Bearer abc123`. Stripping the prefix on one side only makes every request fail.
- **Header name is yours.** There is no fixed Railway header. Make sure `RAILWAY_WEBHOOK_HEADER`
  matches the name you added, and that the name isn't one Railway refuses (`Host`,
  `Content-Type`, `X-Railway-*`, ...).
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths; in Python use `hmac.compare_digest` on bytes, never `str`, which
  raises on non-ASCII.
- **Fail closed.** If `RAILWAY_WEBHOOK_SECRET` is unset, reject everything rather than comparing
  against `undefined`.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  parse JSON after the check.
- **Values are write-only.** You can't read a saved header value back in Railway; keep your own
  copy.
- **Discord/Slack URLs.** Railway reformats payloads for those destinations; this skill covers
  the JSON format sent to your own URL.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `RAILWAY_WEBHOOK_SECRET` unset, or `RAILWAY_WEBHOOK_HEADER` doesn't match the header name in Railway |
| 401 with `Authorization` | The value in Railway includes `Bearer ` but the env var doesn't (or the reverse) |
| 401 only behind a proxy | The proxy strips or renames the custom header (some strip `Authorization`) |
| 401 after editing the webhook | A new value was saved in Railway; update the env var to match |
| 400 after authentication | Body isn't a JSON object |
