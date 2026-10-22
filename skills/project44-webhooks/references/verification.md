# How to Verify project44 Webhook Requests

## How Does project44 Authenticate Webhooks?

project44 does not sign payloads. With the `API_KEY` authentication method it adds a header you
chose (`api_key_name`) with the value you chose (`api_key`) to every request:

```
X-Api-Key: your-secret
```

There is no HMAC, timestamp or prefix of project44's own. The body is not part of the check.

**A static shared credential authenticates the sender, not the body, and gives no replay
protection** (no signature, no timestamp). Anyone who captures one request can replay it or send a
different body with the same header. Use HTTPS only, make handlers idempotent (dedupe on
`eventId`), and rotate the credential if it leaks.

## Implementation

The header name is user-chosen, so read it from `PROJECT44_WEBHOOK_HEADER` (default `X-Api-Key`) and
the expected value from `PROJECT44_WEBHOOK_SECRET`. Compare the **whole** value; don't strip or parse a
`Bearer ` prefix.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyProject44Request(headers, env = process.env) {
  const secret = env.PROJECT44_WEBHOOK_SECRET;
  if (!secret) return false;
  const name = (env.PROJECT44_WEBHOOK_HEADER || 'X-Api-Key').toLowerCase();
  const received = headers[name];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_project44_request(headers, env=os.environ) -> bool:
    secret = env.get("PROJECT44_WEBHOOK_SECRET")
    if not secret:
        return False
    name = env.get("PROJECT44_WEBHOOK_HEADER") or "X-Api-Key"
    received = headers.get(name)  # Starlette headers are case-insensitive
    if not received:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Don't strip `Bearer `.** If the configured value was `Bearer abc`, the whole string is the
  secret.
- **User-chosen header name.** Look it up case-insensitively; the examples use
  `PROJECT44_WEBHOOK_HEADER`.
- **`api_key` vs `api_key_value`.** The docs name the field one way and show the other in the
  example payload. If no header arrives, check how the configuration was stored.
- **Any method.** The webhook method is configurable, and `GET` has no body. Accept `POST`, `PUT`,
  `PATCH` and `GET`, and don't fail on an empty body. Hookdeck's project44 source pre-selects
  only `POST`; allow other methods on the source.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python compare bytes, not `str`.
- **Fail closed.** If `PROJECT44_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) and `JSON.parse` after the header
  check.
- **A `401` drops the message.** project44 does not retry `401` or `500`; a wrong secret loses data.
  Return `503` for your own transient failures so project44 retries.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `PROJECT44_WEBHOOK_SECRET` unset, or differs from the configured value |
| 401 and the value has `Bearer ` | The secret env var must include the `Bearer ` prefix |
| 401 with the right secret | `PROJECT44_WEBHOOK_HEADER` doesn't match `api_key_name` |
| No custom header at all | The configuration used `api_key_value`, or a proxy strips the header |
| 405 or rejected by Hookdeck | Webhook method isn't allowed on the source; allow it there |
| 400 after authentication | Body isn't a JSON object |
