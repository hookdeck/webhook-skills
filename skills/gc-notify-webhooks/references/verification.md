# How to Verify GC Notify Callbacks

## How Does GC Notify Authenticate Callbacks?

GC Notify does not sign payloads. You provide a bearer token for the callback, and GC Notify adds
it to the `Authorization` header of every callback request (a `POST`):

```
Authorization: Bearer <your-token>
```

There is no HMAC and no timestamp. The body is not part of the check, but authenticate before
parsing it.

## What This Check Does Not Give You

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection**: anyone who captures one request (or the token) can replay it or forge new bodies.
Use HTTPS only, keep the token out of logs, and rotate it in GC Notify if it leaks. Make handlers
idempotent (a notification can legitimately produce several callbacks).

## Implementation

The configured secret is the **bare token**. If the configured value itself starts with `Bearer `
(any case) the scheme is stripped, as Hookdeck does. Never trim or otherwise alter the secret.

### Node.js

```javascript
const crypto = require('crypto');
const BEARER = /^bearer /i;

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyGcNotifyRequest(headers, configured = process.env.GC_NOTIFY_WEBHOOK_SECRET) {
  const secret = configured ? configured.replace(BEARER, '') : '';
  if (!secret) return false;
  const header = headers['authorization'];
  if (typeof header !== 'string' || !BEARER.test(header)) return false;
  return safeEqual(Buffer.from(header.slice(7), 'latin1'), Buffer.from(secret, 'utf8'));
}
```

### Python

```python
import hmac, os, re

BEARER = re.compile(r"^bearer ", re.IGNORECASE)

def verify_gc_notify_request(headers, configured=None) -> bool:
    configured = configured if configured is not None else os.environ.get("GC_NOTIFY_WEBHOOK_SECRET", "")
    secret = BEARER.sub("", configured, count=1)
    header = headers.get("authorization")
    if not secret or header is None or not BEARER.match(header):
        return False
    # bytes, never str: compare_digest raises on non-ASCII str
    return hmac.compare_digest(header[7:].encode("latin-1"), secret.encode("utf-8"))
```

## Common Gotchas

- **Scheme is case-insensitive.** Auth schemes are case-insensitive (RFC 9110); match `Bearer `
  in any case, then compare the rest.
- **Store the bare token.** Don't include `Bearer ` in `GC_NOTIFY_WEBHOOK_SECRET` (it is stripped
  if you do). In Hookdeck, paste the bearer token you set for the callback in GC Notify.
- **Constant-time compare.** `timingSafeEqual` throws on unequal lengths, so hash both sides (or
  check lengths first). In Python use `hmac.compare_digest` on bytes.
- **Fail closed.** If the secret is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the check.
- **Respond fast.** GC Notify's guidance is within 1 second; queue slow work.
- **Health checks.** `{"health_check": "true"}` has no `status`; acknowledge it with 200. The docs
  don't say whether it carries the `Authorization` header, so if setup reports a failure, check
  your logs for a 401 on that request.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `GC_NOTIFY_WEBHOOK_SECRET` unset or different from the token set in GC Notify |
| 401 after changing the token | Token changed in GC Notify but not in your environment or Hookdeck source |
| 401 only behind a proxy | The proxy strips or rewrites the `Authorization` header |
| 400 after authentication | Body isn't a JSON object |
| Callbacks stop arriving | Repeated errors led GC Notify to suspend callbacks; fix the endpoint and contact GC Notify |
