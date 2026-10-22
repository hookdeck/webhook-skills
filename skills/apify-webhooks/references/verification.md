# How to Verify Apify Webhook Requests

## How Does Apify Authenticate Webhooks?

It doesn't, out of the box. Apify requests are **unsigned**: there is no HMAC, signature header or
timestamp. The documented options are a secret token in the webhook URL, or a custom header added
with the **Headers template**. This skill uses the header, because the secret stays out of URLs and
logs and it is what Hookdeck's Apify source checks.

```
X-Webhook-Secret: your-random-secret
```

The header name is your choice (`APIFY_WEBHOOK_HEADER`, default `X-Webhook-Secret`). The expected
value is `APIFY_WEBHOOK_SECRET`, compared as the exact whole header value.

`X-Apify-Webhook` and `X-Apify-Webhook-Dispatch-Id` are system headers Apify always sets. They are
not secrets and must not be used for authentication.

## What This Check Does Not Give You

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection** (no signature, no timestamp). Anyone who can read one request, such as a proxy or a
log that stores headers, can replay it or forge new ones. Mitigations:

- Serve the endpoint over HTTPS only.
- Rotate the secret if it leaks: change the Headers template and `APIFY_WEBHOOK_SECRET` together.
- Make handlers idempotent (Apify can deliver a webhook more than once).

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// headers: an object with lowercased keys, e.g. req.headers
function verifyApifyRequest(headers, secret = process.env.APIFY_WEBHOOK_SECRET) {
  if (!secret) return false;
  const name = (process.env.APIFY_WEBHOOK_HEADER || 'X-Webhook-Secret').toLowerCase();
  const received = headers[name];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def safe_equal(a: str, b: str) -> bool:
    # compare_digest on bytes: passing str raises TypeError on non-ASCII input
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_apify_request(headers, secret=None) -> bool:
    secret = secret if secret is not None else os.environ.get("APIFY_WEBHOOK_SECRET")
    if not secret:
        return False
    name = os.environ.get("APIFY_WEBHOOK_HEADER") or "X-Webhook-Secret"
    received = headers.get(name.lower())  # Starlette headers are case-insensitive; plain dicts need lowercase
    return bool(received) and safe_equal(received, secret)
```

## Common Gotchas

- **Compare the whole value.** If the template says `{"Authorization": "Bearer abc"}`, the secret
  is `Bearer abc`. Don't strip or parse `Bearer `.
- **Case-insensitive header name.** Node lowercases names; Starlette and `Headers` objects ignore
  case. Lowercase the configured name before a plain-object lookup.
- **Constant-time compare.** Node: check lengths, then `crypto.timingSafeEqual` on equal-length
  Buffers (it throws on unequal lengths). Python: `hmac.compare_digest` on bytes, never `str`.
- **Fail closed.** If `APIFY_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the header check. Apify sets `Content-Type: application/json`, but the check
  should not depend on it.
- **Templates are string-only.** Header template values must be strings in a JSON object.
- **Don't put the secret in the URL.** URLs end up in access logs and proxies.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `APIFY_WEBHOOK_SECRET` unset, or header missing from the Headers template |
| 401 with the right secret | `APIFY_WEBHOOK_HEADER` doesn't match the template's header name, or the template value has a prefix (e.g. `Bearer `) that the env value lacks |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a JSON object |
| Test button works, runs don't | Template saved on a different webhook, or a different Actor or task |
