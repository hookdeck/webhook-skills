# How to Verify Copper Webhook Requests

## How Does Copper Authenticate Webhooks?

Copper does not sign payloads. There is no HMAC and no timestamp. When you create a subscription
you can pass a `headers` object; Copper sends those headers on every notification. Put a secret
in one:

```
X-Webhook-Secret: your-secret-value
```

Your endpoint looks up that header (case-insensitively) and compares the **whole** value with the
one you stored. Don't strip or parse a `Bearer ` prefix: if you typed `Bearer abc` into the
subscription, store `Bearer abc`. This matches how Hookdeck's Copper source verifies requests
(header name plus exact value).

## What Does This Protect (and Not)?

A static shared credential **authenticates the sender, not the body**. Anyone who learns the value
can send any body, and anyone who captures a request can replay it, because there is no signature
and no timestamp. So:

- Use HTTPS (Copper only accepts `https://` targets).
- Rotate the credential if it leaks (`PUT /webhooks/{id}` with new `headers`).
- Make handlers idempotent; see webhook-handler-patterns.

The subscription's optional `secret` object is not sent as a header: its key/value pairs are merged
into the top level of the JSON **body** (there is no `secret` field wrapping them).
You can compare it as an extra check, but it is weaker (it lives in the payload) and Hookdeck does
not perform it.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function verifyCopperRequest(headers, expected = process.env.COPPER_WEBHOOK_SECRET) {
  if (!expected) return false;
  const name = (process.env.COPPER_WEBHOOK_HEADER || 'X-Webhook-Secret').toLowerCase();
  const received = headers[name];
  return Boolean(received) && safeEqual(received, expected);
}
```

### Python

```python
import hmac, os

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_copper_request(headers, expected=None) -> bool:
    expected = expected if expected is not None else os.environ.get("COPPER_WEBHOOK_SECRET")
    if not expected:
        return False
    name = os.environ.get("COPPER_WEBHOOK_HEADER", "X-Webhook-Secret").lower()
    received = next((v for k, v in headers.items() if k.lower() == name), None)
    return bool(received) and safe_equal(received, expected)
```

## Common Gotchas

- **Header name is yours.** Copper doesn't define one. Keep `COPPER_WEBHOOK_HEADER` in sync with
  the key in the subscription's `headers` object.
- **Whole value.** Compare the full header value. Don't strip `Bearer `.
- **Constant-time compare.** `timingSafeEqual` throws on unequal lengths, so check lengths first.
  In Python use `hmac.compare_digest` on bytes.
- **Fail closed.** If `COPPER_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, and
  `JSON.parse` after the header check.
- **No retries.** Copper fires each notification once. A `401` from a misconfigured secret loses
  that event, so check configuration before relying on it.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `COPPER_WEBHOOK_SECRET` unset, or differs from the subscription's `headers` value |
| 401 and the secret looks right | Header name mismatch with `COPPER_WEBHOOK_HEADER`, or a `Bearer ` prefix in one place only |
| 401 only behind a proxy | The proxy strips or renames the custom header |
| 400 after authentication | Body isn't a JSON object, or `ids`/`type`/`event` are missing |
