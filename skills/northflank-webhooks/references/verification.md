# Northflank Webhook Authentication

## How Does Northflank Authenticate Webhooks?

There is **no payload signature** (no HMAC, no timestamp). If you set a secret on the webhook
notification integration, Northflank sends it unchanged in:

```
X-Northflank-Notification-Integration-Token: <your secret>
```

Compare that value with the secret stored in your app (`NORTHFLANK_WEBHOOK_SECRET`). The secret
is optional in Northflank: with none set, the header carries nothing useful and your endpoint
can't tell Northflank from anyone else. Always set one.

Northflank's own example uses `receivedSecret !== actualSecret`. Prefer a constant-time compare.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

// Hash both sides: equal-length buffers, so timingSafeEqual never throws.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyNorthflankRequest(headers, secret = process.env.NORTHFLANK_WEBHOOK_SECRET) {
  if (!secret) return false;
  const token = headers['x-northflank-notification-integration-token'];
  return Boolean(token) && safeEqual(token, secret);
}
```

### Python

```python
import hashlib, hmac

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest()
    )

def verify_northflank_request(headers, secret: str) -> bool:
    token = headers.get("X-Northflank-Notification-Integration-Token")
    return bool(secret) and bool(token) and safe_equal(token, secret)
```

## Common Gotchas

- **Unset secret in your app**: fail closed. If `NORTHFLANK_WEBHOOK_SECRET` is empty, reject
  everything rather than comparing `undefined === undefined`.
- **Express body parsing**: Northflank's docs use `express.json()`. Use
  `express.raw({ type: '*/*' })` instead so any content type reaches the handler, and authenticate
  before parsing.
- **Header casing**: Node lowercases header names (`x-northflank-notification-integration-token`);
  Next.js `Headers` and Starlette headers are case-insensitive.
- **Non-2xx responses**: Northflank resends the notification a limited number of times and
  disables webhooks that keep failing. Return `401` only for bad tokens; don't let handler bugs
  turn into repeated failures. Dedupe on `X-Northflank-Notification-Integration-Event-Id`.
- **Token is a bearer secret**: anyone who sees a request (logs, proxies) sees the token. Use
  HTTPS and don't log headers.

## Debugging Verification Failures

1. Open the integration in Northflank and inspect a recent request: confirm the token header is
   present and which response status your endpoint returned.
2. Compare lengths of the stored secret and the header value; trailing newlines in env files and
   secret files are a common cause.
3. Check you're verifying the integration that sends to this URL (each integration has its own
   secret, and `X-Northflank-Notification-Integration-Id` tells you which one called).
4. Resend the request from the event page after fixing the secret.
