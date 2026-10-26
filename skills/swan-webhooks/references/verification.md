# How to Verify Swan Webhook Requests

## How Does Swan Authenticate Webhooks?

Swan does not sign payloads. When a webhook subscription has a secret, Swan includes it as plain text
in the `x-swan-secret` header of every request:

```
x-swan-secret: your-webhook-secret
```

There is no HMAC, timestamp or prefix. Compare the **whole** header value with your secret.

Set a webhook secret on the Swan webhook subscription. Subscriptions without one send nothing to verify.

> **Security limits.** A static shared secret authenticates the sender, not the body, and gives no replay
> protection (no signature, no timestamp). Anyone who captures one request can replay it or forge new
> bodies. Use HTTPS, deduplicate on `eventId`, and rotate the secret (`updateWebhookSubscription`) if it leaks.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function verifySwanRequest(headers, secret = process.env.SWAN_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers['x-swan-secret'];
  return typeof received === 'string' && received.length > 0 && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_swan_request(headers, secret=None) -> bool:
    secret = secret if secret is not None else os.environ.get("SWAN_WEBHOOK_SECRET")
    received = headers.get("x-swan-secret")
    if not secret or not received:
        return False
    # bytes on both sides: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Why does the secret sometimes not arrive?** The secret is optional per subscription. No secret set means no
  `x-swan-secret` header. Set one.
- **Compare the whole value.** Not a prefix, not a `Bearer` scheme.
- **Constant-time compare.** `timingSafeEqual` throws on unequal lengths, so check lengths first. In Python
  encode both sides to bytes before `hmac.compare_digest`.
- **Fail closed.** If `SWAN_WEBHOOK_SECRET` is unset, reject everything rather than comparing against `undefined`.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then parse after
  the secret check.
- **Retries.** Failed deliveries are retried every 30 seconds up to 7 times; the secret is sent each time.
- **One secret per subscription.** If one endpoint serves several subscriptions with different secrets, check against each.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `SWAN_WEBHOOK_SECRET` unset or differs from the subscription's secret |
| 401, no `x-swan-secret` in the request | The subscription has no secret |
| 401 only in Live (or only in Sandbox) | The two environments have different subscriptions and secrets |
| 401 only behind a proxy | The proxy strips or renames `x-swan-secret` |
| 400 after authentication | Body isn't a JSON object |
