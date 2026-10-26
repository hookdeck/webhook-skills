# How to Verify Nextcloud Webhook Requests

## Does Nextcloud Sign Webhooks?

No. There is no HMAC, signature header or timestamp. With `authMethod: "header"` the
`webhook_listeners` app merges your `authData` (`{header: value}`) into the request headers, and
your endpoint checks that header against the value you stored.

```
Authorization: Bearer a-long-random-value
```

The header name is chosen by whoever registers the webhook, so the examples read it from
`NEXTCLOUD_WEBHOOK_HEADER` (default `Authorization`) and the expected value from
`NEXTCLOUD_WEBHOOK_SECRET`.

> **What this does and doesn't give you.** A static shared credential authenticates the *sender*,
> not the body, and provides no replay protection (no signature, no timestamp): anyone who
> captures one request can resend it or craft their own. Use HTTPS and rotate the credential if it
> leaks. Make handlers idempotent.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyNextcloudRequest(headers,
    secret = process.env.NEXTCLOUD_WEBHOOK_SECRET,
    headerName = process.env.NEXTCLOUD_WEBHOOK_HEADER || 'Authorization') {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_nextcloud_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("NEXTCLOUD_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("NEXTCLOUD_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Compare the whole value.** If `authData` is `{"Authorization": "Bearer abc"}`, the secret is
  `Bearer abc`. Don't strip, split or parse the prefix, and don't accept the bare `abc`.
- **Header name is user-chosen.** Look it up case-insensitively and make it configurable.
- **Accept any HTTP method.** `httpMethod` is a free string; a POST-only route returns 405 to a
  listener registered with PUT or GET. Handle an empty body too.
- **Constant-time compare.** In Node check lengths (or hash both sides) before `timingSafeEqual`,
  which throws on unequal lengths. In Python use `hmac.compare_digest` on bytes: passing `str`
  raises `TypeError` on non-ASCII input.
- **Fail closed.** If `NEXTCLOUD_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type works, then
  `JSON.parse` after the credential check.
- **No signature means no body integrity.** Don't treat a valid header as proof the payload is
  unmodified in transit; HTTPS is what protects it.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret unset, wrong header name, or `Bearer ` prefix missing or doubled in the stored value |
| 401 began suddenly | The credential was rotated in the listener (`POST .../webhooks/{id}`) but not in your env |
| 401 only behind a proxy | The proxy strips or rewrites `Authorization` (use a custom header name instead) |
| 405 | Route only accepts POST but the listener's `httpMethod` is something else |
| 400 after authentication | Body isn't a JSON object |
| Nothing arrives | `webhook_listeners` not enabled, or background jobs haven't run yet (default 5 minutes) |
