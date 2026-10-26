# How to Verify Currents Webhook Requests

## How Does Currents Authenticate Webhooks?

Currents does not sign payloads. Its [security docs](https://docs.currents.dev/resources/integrations/http-webhooks#security)
describe two things:

- **Custom headers**: a secret key you add to the integration's Headers field, sent with every
  request. Your endpoint compares it with the value it stored.
- **`x-timestamp`**: the system's epoch timestamp, sent with every request "to help you prevent
  replay attacks". It is not signed.

There is no HMAC, no signed content, and no fixed header name. The raw body is not part of the
check, but authenticate before parsing it.

> **A static shared credential authenticates the sender, not the body, and gives no replay
> protection** (no signature, and `x-timestamp` is unsigned). Anyone who captures one request can
> resend it with a fresh `x-timestamp`.
> Use HTTPS, keep the secret out of logs, and rotate it if it leaks.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyCurrentsRequest(
  headers,
  secret = process.env.CURRENTS_WEBHOOK_SECRET,
  headerName = process.env.CURRENTS_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_currents_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("CURRENTS_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("CURRENTS_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    if not secret or not received:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## What About x-timestamp?

Currents documents `x-timestamp` as a replay-attack aid and asks you to keep your server clock
synchronized. It is not signed, so an attacker who replays a captured request can also set a fresh
value. It is at most a freshness hint: you may log it or drop requests that are wildly stale, but
don't rely on it for replay protection. Deduplicate on `buildId` + `groupId` + `event` instead.
Currents' docs don't say whether it uses seconds or milliseconds, or whether failed deliveries
are retried, so check real requests before enforcing a freshness window.

## Common Gotchas

- **Compare the whole value.** If the header is `Bearer abc`, the secret variable is
  `Bearer abc`. Don't strip a prefix.
- **Header name is yours.** Set `CURRENTS_WEBHOOK_HEADER` to whatever you typed in Currents.
  Lookup is case-insensitive.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python, pass bytes to `hmac.compare_digest`, not `str`.
- **Fail closed.** If `CURRENTS_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted,
  then `JSON.parse` after the credential check.
- **Rotate on leak.** Change the value in both Currents and your environment together.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret unset, wrong header name, or header never added in Currents |
| 401 with `Authorization` | Value missing the `Bearer ` prefix you typed in Currents (or the reverse) |
| 401 only behind a proxy | The proxy strips or renames the header |
| 401 began after editing the integration | Header value changed in Currents but not in your environment |
| 400 after authentication | Body isn't a JSON object |
