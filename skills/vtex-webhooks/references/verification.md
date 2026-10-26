# How to Authenticate VTEX Webhook Requests

## Does VTEX Sign Webhooks?

No. VTEX Orders API hook requests carry no signature and no timestamp. What VTEX does send is every
entry of the `headers` object in your hook configuration. Add a secret header there and check it on
every request.

```json
"hook": { "url": "https://example.com/webhooks/vtex", "headers": { "X-Webhook-Secret": "your-secret-value" } }
```

The header name is yours to choose, so the examples read it from `VTEX_WEBHOOK_HEADER` (default
`X-Webhook-Secret`) and the expected value from `VTEX_WEBHOOK_SECRET`. This is an API key style
check: header name plus exact value, which is how Hookdeck's VTEX source verifies it.

## What a Shared Credential Does and Doesn't Give You

A static shared credential authenticates the **sender**, not the **body**. There is no signature
over the payload and no timestamp, so it gives **no replay protection**: anyone who captures one
valid request can resend it. Mitigate this by:

- using HTTPS only,
- rotating the credential if it leaks (see [setup.md](setup.md)),
- making handlers idempotent (key on `OrderId` + `State`) and
- re-reading the order from the Orders API before acting on it.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyVtexRequest(headers, name = process.env.VTEX_WEBHOOK_HEADER || 'X-Webhook-Secret',
                           secret = process.env.VTEX_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

Equal-length buffers are required by `timingSafeEqual`; hashing both sides (or checking lengths
first) avoids the throw.

### Python

```python
import hmac, os

def verify_vtex_request(headers, name=None, secret=None) -> bool:
    name = name or os.environ.get("VTEX_WEBHOOK_HEADER") or "X-Webhook-Secret"
    secret = secret or os.environ.get("VTEX_WEBHOOK_SECRET")
    received = {k.lower(): v for k, v in headers.items()}.get(name.lower())  # case-insensitive
    if not secret or not received:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## The Ping

When the hook is saved VTEX POSTs `{"hookConfig": "ping"}` and needs `200`. The docs don't say
whether the ping carries your headers, so answer it **before** the auth check and do nothing with it.
Everything else must pass the check first.

## Common Gotchas

- **Compare the whole value.** If you typed `Bearer abc` in the hook headers, the expected value is
  `Bearer abc`. Don't strip or parse the prefix.
- **Header names are case-insensitive.** Look the header up case-insensitively (Node lower-cases
  names; `Headers.get` and Starlette handle it).
- **Fail closed.** If `VTEX_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type works, and parse
  JSON after the credential check.
- **Hook expiry.** VTEX removes the hook after three days without notifications. That looks like
  "webhooks stopped" rather than a 401.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `VTEX_WEBHOOK_SECRET` unset, or `VTEX_WEBHOOK_HEADER` doesn't match the name in the hook `headers` |
| 401 with the right secret | A `Bearer ` prefix (or trailing whitespace) in the configured value that isn't in the env var |
| 400 when saving the hook | Endpoint didn't return `200` to the `hookConfig` ping |
| 401 only behind a proxy | The proxy strips or renames the custom header |
| Notifications stopped arriving | Hook was removed after three days with no notifications; reconfigure it |
