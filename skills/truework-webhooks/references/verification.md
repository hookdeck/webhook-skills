# How to Authenticate Truework Webhooks

## How It Works

Truework does **not** sign payloads. There is no HMAC, no timestamp and no signature header. Instead, each webhook has an authentication token, and Truework includes it in every request in the **`X-Truework-Token`** header. Truework's guidance is to reject any request whose token does not match the token for that webhook.

## Implementation

Compare the header with `TRUEWORK_WEBHOOK_TOKEN` in constant time. Hash both sides first (or check lengths) so `crypto.timingSafeEqual` never gets buffers of different length.

### Node.js

```javascript
const crypto = require('crypto');
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const h = (s) => crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(h(a), h(b));
}
```

### Python

```python
import hashlib, hmac
def safe_equal(a, b):
    h = lambda s: hashlib.sha256(s.encode()).digest()
    return hmac.compare_digest(h(a or ""), h(b))
```

Return `401` on a missing or wrong token, and `500` if `TRUEWORK_WEBHOOK_TOKEN` is not configured (fail closed, so an unset variable never matches an empty header).

## Common Gotchas

- **No payload signature**: anyone who learns the token can forge requests. Keep it secret, serve the endpoint over HTTPS, and rotate by recreating the webhook.
- **Recreated webhook = new token**: update `TRUEWORK_WEBHOOK_TOKEN` or every delivery returns 401 and is retried for 48 hours.
- **Sandbox vs Production tokens differ.**
- **Don't parse before authenticating**; reading the raw body with `express.raw({ type: '*/*' })` works for any content type.
- **Duplicates happen**: dedupe on `hook.id` plus `data` (for example `order_id` and `verification_request_id` and `state`).

## Optional: IP Allowlist

Truework publishes source IPs (subject to change; it makes a best effort to announce changes), which you can allowlist as an extra layer:

- Production: `18.218.101.165`, `3.133.214.186`, `3.23.196.239`
- Sandbox: `3.22.163.100`

Check [Webhook security](https://www.truework.com/docs/api-reference/webhooks/security) for the current list.

## Debugging Verification Failures

| Symptom | Likely cause |
|---|---|
| 401 on every delivery | Wrong token, token from a different environment, or webhook was recreated |
| 500 on every delivery | `TRUEWORK_WEBHOOK_TOKEN` not set in the running process |
| 401 only behind a proxy | The proxy strips or renames `X-Truework-Token` |
