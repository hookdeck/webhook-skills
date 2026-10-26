# How to Verify Arcadia Webhook Requests

## How Does Arcadia Authenticate Webhooks?

Arcadia does not sign payloads. Arcadia's docs say custom headers "can be useful for
authentication purposes to verify that a webhook is coming from Arcadia". Arcadia support adds a
header of your choosing to every webhook, and you compare it with the value you stored:

```
X-Arcadia-Token: your-long-random-value
```

Arcadia support sets the header name and value: open a support ticket to request one. Values cannot contain spaces.

There is no HMAC, timestamp or algorithm. The name is user-chosen, so read it from
`ARCADIA_WEBHOOK_HEADER` (default `X-Arcadia-Token`), look it up case-insensitively and compare the
**whole** value with `ARCADIA_WEBHOOK_SECRET`. Do not strip or parse a `Bearer ` prefix: if the
value you were given contains one, it is part of the expected value.

## What This Does Not Protect

A static shared credential authenticates the sender, not the body. There is no signature and no
timestamp, so there is no integrity check and **no replay protection**: anyone who captures a
request can resend it. Mitigate with:

- HTTPS only
- treating the value like a password, and asking Arcadia support to rotate it if it leaks
- de-duplicating on the payload `id` (`whk_...`) so replays and retries are harmless

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyArcadiaRequest(headers, env = process.env) {
  const secret = env.ARCADIA_WEBHOOK_SECRET;
  if (!secret) return false;
  const name = (env.ARCADIA_WEBHOOK_HEADER || 'X-Arcadia-Token').toLowerCase();
  const received = headers[name];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_arcadia_request(headers, env=os.environ) -> bool:
    secret = env.get("ARCADIA_WEBHOOK_SECRET")
    if not secret:
        return False
    name = env.get("ARCADIA_WEBHOOK_HEADER") or "X-Arcadia-Token"
    received = headers.get(name)  # Starlette headers are case-insensitive
    # compare_digest on bytes: str raises TypeError on non-ASCII
    return bool(received) and hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Header name is yours.** There is no fixed Arcadia header. Use the name you gave support.
- **No spaces.** Arcadia rejects values with spaces, so `Bearer x` can't be used.
- **Whole value.** If you did type a `Bearer ` prefix into the value, set `ARCADIA_WEBHOOK_SECRET`
  to the full string including it.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python, pass bytes to `compare_digest`.
- **Fail closed.** If `ARCADIA_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the header check.
- **Organization-wide.** The header is the same for every webhook in the organization.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `ARCADIA_WEBHOOK_SECRET` unset, or `ARCADIA_WEBHOOK_HEADER` differs from what support configured |
| 401 and the value has a `Bearer ` prefix | Prefix missing from `ARCADIA_WEBHOOK_SECRET`; the comparison is on the whole value |
| 401 began suddenly | Arcadia support rotated the value |
| 401 only behind a proxy | The proxy strips or renames the custom header |
| 400 after authentication | Body isn't a JSON object |
