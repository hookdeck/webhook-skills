# How to Verify Ship24 Webhook Requests

## How Does Ship24 Authenticate Webhooks?

Ship24 does not sign payloads. It allocates a random Webhook Secret to your account and sends it
on every webhook request:

```
Authorization: Bearer your_webhook_secret
```

The secret is visible in your Ship24 dashboard. Comparing the header with it confirms the request
came from Ship24. There is no HMAC, timestamp or message ID check, and the body is not part of
the comparison.

## What Does a Static Shared Credential Protect?

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection** (no signature, no timestamp). Anyone who captures a request or learns the secret can
send your endpoint arbitrary tracking data, and a captured request can be replayed unchanged. So:

- Serve the endpoint over HTTPS only.
- Rotate the Webhook Secret if it leaks, and update `SHIP24_WEBHOOK_SECRET` at the same time.
- Dedupe on `metadata.messageId` (this also absorbs Ship24's own retries).

## Implementation

Configure the **bare secret** in `SHIP24_WEBHOOK_SECRET`. If the configured value itself starts
with `Bearer ` (any case) it is stripped, as Hookdeck does. The request's `Authorization` header
must start with `Bearer ` (the scheme is case-insensitive, RFC 9110); the rest is compared to the
secret in constant time. The secret is never trimmed or otherwise altered.

### Node.js

```javascript
const crypto = require('crypto');

function verifyShip24Request(headers, configured = process.env.SHIP24_WEBHOOK_SECRET) {
  if (!configured) return false;
  const secret = Buffer.from(configured.replace(/^bearer /i, ''), 'utf8');
  if (!secret.length) return false; // a configured value of just "Bearer " must not match
  const header = headers['authorization'];
  if (typeof header !== 'string' || header.slice(0, 7).toLowerCase() !== 'bearer ') return false;
  const received = Buffer.from(header.slice(7), 'latin1');
  // timingSafeEqual throws on unequal lengths, so check them first.
  return secret.length > 0 && received.length === secret.length &&
    crypto.timingSafeEqual(received, secret);
}
```

### Python

```python
import hmac, os, re

def verify_ship24_request(headers, configured=None) -> bool:
    configured = configured if configured is not None else os.environ.get("SHIP24_WEBHOOK_SECRET")
    if not configured:
        return False
    secret = re.sub(r"^bearer ", "", configured, flags=re.IGNORECASE).encode("utf-8")
    if not secret:
        return False  # a configured value of just "Bearer " must not match
    header = headers.get("authorization")
    if not header or header[:7].lower() != "bearer ":
        return False
    try:
        received = header[7:].encode("latin-1")   # HTTP headers are latin-1 on the wire
    except UnicodeEncodeError:
        return False
    # Bytes, never str: compare_digest raises TypeError on non-ASCII str.
    return bool(secret) and hmac.compare_digest(received, secret)
```

## Common Gotchas

- **Store the bare secret.** `SHIP24_WEBHOOK_SECRET` should not include `Bearer `. (A pasted prefix
  is tolerated and stripped.)
- **Scheme case.** `bearer`, `Bearer` and `BEARER` are all valid; match case-insensitively.
- **Don't trim the secret.** Whitespace is part of the value if it is part of the value.
- **Constant-time compare.** Check lengths before `crypto.timingSafeEqual`, and use
  `hmac.compare_digest` on bytes in Python.
- **Fail closed.** If `SHIP24_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` only after the check passes.
- **Same secret for both URLs.** The Webhook URL and Proof of Delivery Webhook URL share one secret.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `SHIP24_WEBHOOK_SECRET` unset, or copied from the wrong account |
| 401 began suddenly | The Webhook Secret was changed in the dashboard; copy the new one |
| 401 only behind a proxy | The proxy strips or rewrites the `Authorization` header |
| 401 with a correct secret | Trailing whitespace or quotes in `.env` |
| 400 after authentication | Body isn't `{ "trackings": [...] }` |
