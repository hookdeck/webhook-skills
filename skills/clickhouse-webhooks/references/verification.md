# How to Verify ClickStack (ClickHouse) Webhook Requests

## How Does ClickStack Authenticate Webhooks?

It doesn't sign them. Covers ClickStack alert webhooks of type Generic only. The Generic webhook
lets you add arbitrary **Webhook headers**; you add a secret header and your endpoint checks it.

```
Authorization: Bearer a-long-random-string      # or any header name you chose
```

> A static shared credential authenticates the sender, not the body, and gives no replay
> protection (no signature, no timestamp). Anyone who captures one request can replay it or
> send a different body with the same header. Use HTTPS, and rotate the credential if it leaks.

Hookdeck's ClickHouse source does the same: API key verification with a header name plus the
exact whole value.

## Implementation

The header name comes from `CLICKHOUSE_WEBHOOK_HEADER` (default `Authorization`) and the expected
value from `CLICKHOUSE_WEBHOOK_SECRET`. Look the header up case-insensitively and compare the
**whole** value. Do not strip or parse a `Bearer ` prefix.

### Node.js

```javascript
const crypto = require('crypto');

const digest = (v) => crypto.createHash('sha256').update(String(v)).digest();

function verifyClickHouseRequest(headers, env = process.env) {
  const secret = env.CLICKHOUSE_WEBHOOK_SECRET;
  if (!secret) return false;
  const name = (env.CLICKHOUSE_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[name];
  return Boolean(received) && crypto.timingSafeEqual(digest(received), digest(secret));
}
```

### Python

```python
import hmac, os

def verify_clickhouse_request(headers, env=os.environ) -> bool:
    secret = env.get("CLICKHOUSE_WEBHOOK_SECRET")
    if not secret:
        return False
    name = env.get("CLICKHOUSE_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(name)  # Starlette headers are case-insensitive
    # bytes on both sides: compare_digest raises TypeError on non-ASCII str
    return bool(received) and hmac.compare_digest(received.encode(), secret.encode())
```

## Common Gotchas

- **Whole value.** If the header is `Bearer abc`, set the secret to `Bearer abc`. Comparing only
  `abc` fails.
- **Header name is yours.** There is no vendor-defined header. It must match what you typed under
  Webhook headers, case-insensitively.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `compare_digest` on bytes.
- **Fail closed.** If `CLICKHOUSE_WEBHOOK_SECRET` is unset, reject everything.
- **Any content type.** Method and content type aren't documented. Read the body raw
  (`express.raw({ type: '*/*' })`), authenticate, then parse; fall back to plain text if it isn't
  JSON.
- **Repeat deliveries.** An alert can fire on every evaluation while the condition holds.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret unset, or header name differs from `CLICKHOUSE_WEBHOOK_HEADER` |
| 401 and the secret looks right | `Bearer ` prefix typed in ClickStack but missing from the secret |
| 401 only behind a proxy | The proxy strips or renames the header (especially `Authorization`) |
| Body arrives as text | Your template isn't JSON; handle plain text |
