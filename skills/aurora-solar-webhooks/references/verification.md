# How to Verify Aurora Solar Webhook Requests

## How Does Aurora Solar Authenticate Webhooks?

Aurora does not sign webhooks. There is no HMAC, no signature header and no timestamp. Instead you
can add a secret header to the subscription (`header_auth_key` and `header_auth_value`) and Aurora
sends it with every webhook. Your endpoint compares it with the value you stored.

```
X-Aurora-Webhook-Token: your-header-auth-value
```

The header name is user-chosen. The examples read it from `AURORA_SOLAR_WEBHOOK_HEADER` (default
`X-Aurora-Webhook-Token`) and the expected value from `AURORA_SOLAR_WEBHOOK_SECRET`.

> Set header_auth_key and header_auth_value on the Aurora Solar webhook and enter them here. Webhooks without them send nothing to verify.

**What this does and doesn't give you.** A static shared credential authenticates the sender, not
the body, and gives no replay protection (no signature, no timestamp). Anyone who captures a
request can replay it. Use an HTTPS URL, and rotate `header_auth_value` on the subscription (and
your stored secret) if it leaks. Aurora's other option, Basic Auth, is not covered by Hookdeck's
Aurora Solar source.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyAuroraSolarRequest(
  headers,
  secret = process.env.AURORA_SOLAR_WEBHOOK_SECRET,
  headerName = process.env.AURORA_SOLAR_WEBHOOK_HEADER || 'X-Aurora-Webhook-Token'
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
    # bytes on both sides: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_aurora_solar_request(headers, secret=None, header_name=None) -> bool:
    secret = secret or os.environ.get("AURORA_SOLAR_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("AURORA_SOLAR_WEBHOOK_HEADER") or "X-Aurora-Webhook-Token"
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(secret and received and safe_equal(received, secret))
```

## Order of Operations

1. Check the header. Missing or mismatched: `401`.
2. Read the query parameters (`event`, `project_id`, ...). No `event`: `400`.
3. Handle the event idempotently and return `200` within 10 seconds.

## Common Gotchas

- **Compare the whole value.** If you typed `Bearer abc` as `header_auth_value`, the secret is
  `Bearer abc`. Do not strip or parse the prefix on either side.
- **Header names are case-insensitive.** Node lowercases them; Next.js `Headers` and Starlette
  look them up case-insensitively.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python compare bytes, never `str`.
- **Fail closed.** If `AURORA_SOLAR_WEBHOOK_SECRET` is unset, reject everything.
- **GET has no body.** Don't wait for or parse one; the data is in the query string. Read any body
  raw (`express.raw({ type: '*/*' })`) if you also accept POST.
- **Query values are strings.** `is_first_view` arrives as `"true"` or `"false"`.
- **Retries reuse the latest subscription.** Aurora retries with the most recent webhook
  definition, so you can fix a wrong header value and let retries succeed.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret or header name env var unset, or doesn't match `header_auth_key` / `header_auth_value` |
| 401 with the right secret | A `Bearer ` prefix was added or dropped on one side |
| 401 only behind a proxy | The proxy strips or renames the custom header |
| Aurora sends no auth header | The subscription has no header auth set; nothing to verify |
| 400 after authentication | The URL template has no `event=` parameter |
| Subscription auto-disabled | 48 hours of failed retries; fix the endpoint and re-enable it |
