# How to Verify Honeycomb Webhook Requests

## How Does Honeycomb Authenticate Webhooks?

Honeycomb does not sign payloads. When the webhook integration has a Shared Secret, Honeycomb
always sends it as plain text in a header (custom headers can't override it):

```
X-Honeycomb-Webhook-Token: your-shared-secret
```

There is no HMAC, timestamp or prefix. Compare the **whole** header value with the secret.

**What this does and doesn't give you.** A static shared credential authenticates the sender, not
the body, and gives no replay protection (no signature, no timestamp). Anyone who captures one
request can replay it or send a different body with the same header. Use HTTPS, rotate the Shared
Secret if it leaks, and use `X-Honeycomb-Webhook-Delivery-ID` to drop repeated deliveries.

> **Hookdeck setup note:** Set a Shared Secret on the Honeycomb webhook. Webhooks without one send nothing to verify.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyHoneycombRequest(headers, secret = process.env.HONEYCOMB_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers['x-honeycomb-webhook-token'];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_honeycomb_request(headers, secret=None) -> bool:
    secret = secret or os.environ.get("HONEYCOMB_WEBHOOK_SECRET")
    received = headers.get("x-honeycomb-webhook-token")
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **No secret, nothing to verify.** The Shared Secret is optional in Honeycomb; without it no
  token header is sent, so every request fails this check. Set one.
- **Check every method.** The docs don't name the HTTP method; authenticate GET, POST, PUT, PATCH
  and DELETE the same way, before reading the body. Hookdeck's source pre-selects POST, so allow
  any other method Honeycomb uses.
- **Whole value, constant time.** Don't compare prefixes or trim. Hash both sides (or check
  lengths) before `timingSafeEqual`, which throws on unequal lengths. In Python, encode both sides
  to bytes for `compare_digest`; passing `str` raises on non-ASCII.
- **Fail closed.** If `HONEYCOMB_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the check. Accept an empty body.
- **Rejected deliveries aren't retried.** Honeycomb doesn't retry a `401` or other 4xx/5xx, so a wrong secret loses
  that delivery. Fix the secret, then trigger the alert again.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `HONEYCOMB_WEBHOOK_SECRET` unset, or differs from the integration's Shared Secret |
| 401 and no `X-Honeycomb-Webhook-Token` in the logs | The webhook has no Shared Secret; set one |
| 401 began after editing the integration | The Shared Secret was changed; update the env var |
| 401 only behind a proxy | The proxy strips or renames the header |
| 405 on some requests | The route or Hookdeck source doesn't allow the method Honeycomb uses |
| 400 after authentication | Body isn't empty and isn't a JSON object (check the custom payload template) |
