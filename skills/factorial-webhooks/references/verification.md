# How to Verify Factorial Webhook Requests

## How Does Factorial Authenticate Webhooks?

Factorial does not sign payloads: there is no HMAC, signature header or timestamp. If you set a
`challenge` when creating the subscription, Factorial sends it as plain text in the
`x-factorial-wh-challenge` header on every delivery. **If you set no challenge, Factorial sends
nothing to verify**, so set one.

```
x-factorial-wh-challenge: your-subscription-challenge
```

Compare the **whole** header value with the challenge you stored (`FACTORIAL_WH_CHALLENGE`).
Factorial's own example does the same:
`req.get('x-factorial-wh-challenge') !== process.env.FACTORIAL_WH_CHALLENGE` returns `401`.

## What This Does and Doesn't Protect

A static shared credential authenticates the **sender**, not the **body**. It gives **no replay
protection** (no signature, no timestamp): anyone who captures one request, or learns the
challenge, can send arbitrary bodies. Serve the endpoint over HTTPS only (Factorial requires it),
and rotate the challenge if it leaks (create a new subscription with a new challenge, then delete
the old one). Treat payloads as untrusted input and validate the fields you rely on.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyFactorialRequest(headers, challenge = process.env.FACTORIAL_WH_CHALLENGE) {
  if (!challenge) return false;
  const received = headers['x-factorial-wh-challenge'];
  return Boolean(received) && safeEqual(received, challenge);
}
```

### Python

```python
import hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_factorial_request(headers, challenge=None) -> bool:
    challenge = challenge or os.environ.get("FACTORIAL_WH_CHALLENGE")
    received = headers.get("x-factorial-wh-challenge")
    return bool(challenge and received and safe_equal(received, challenge))
```

## Common Gotchas

- **No challenge, nothing to verify.** Subscriptions created without `challenge` send no header.
- **Compare the whole value.** No prefix, no `Bearer`, no splitting. Header names are case-insensitive.
- **Constant-time compare.** `crypto.timingSafeEqual` throws on unequal lengths, so hash both sides
  (or check lengths first). In Python, `hmac.compare_digest` needs bytes for non-ASCII input:
  encode both sides, never pass `str`.
- **Fail closed.** If `FACTORIAL_WH_CHALLENGE` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, and
  `JSON.parse` only after the challenge check.
- **One challenge per subscription.** If one endpoint serves several subscriptions with different
  challenges, check against each.
- **Don't reuse a user-facing auth middleware** on the webhook route, or it will 401 first.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `FACTORIAL_WH_CHALLENGE` unset, or differs from the subscription's `challenge` |
| No header at all | The subscription was created without a `challenge` |
| 401 only behind a proxy | The proxy strips or renames `x-factorial-wh-challenge` |
| 401 from your own middleware | Auth middleware runs before the webhook route |
| 400 after authentication | Body isn't a JSON object |
| Deliveries stopped | Retries were exhausted and the subscription was disabled; re-enable it |
