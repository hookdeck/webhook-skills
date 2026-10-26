# How to Verify RapidAPI Webhook Requests

## How Does RapidAPI Authenticate Webhooks?

RapidAPI does not sign payloads. In every webhook request the Enterprise Hub includes its secret
key in the `x-rapidapi-webhook-secret` header, as plain text. The docs say its purpose is "to
ensure that the request is coming from your RapidAPI Enterprise Hub".

```
x-rapidapi-webhook-secret: your-secret-key
```

There is no HMAC, timestamp or prefix. Compare the whole header value (header name is
case-insensitive) with the key from the **Events** tab, then parse the body.

## What Does a Shared Secret Protect Against?

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp). Anyone who captures one request can replay it or send a
different body with the same header. So:

- Use HTTPS only.
- Make handlers idempotent (see webhook-handler-patterns).
- Rotate the key with **Generate new** if it leaks, and update `RAPIDAPI_WEBHOOK_SECRET`.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function verifyRapidApiRequest(headers, secret = process.env.RAPIDAPI_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers['x-rapidapi-webhook-secret'];
  return Boolean(received) && safeEqual(received, secret);
}
```

Hashing both sides with SHA-256 first and comparing the digests is equally valid.

### Python

```python
import hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_rapidapi_request(headers, secret=None) -> bool:
    secret = secret or os.environ.get("RAPIDAPI_WEBHOOK_SECRET")
    received = headers.get("x-rapidapi-webhook-secret")
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Encode before `compare_digest`.** Passing `str` raises `TypeError` on non-ASCII input; compare bytes.
- **Check lengths before `timingSafeEqual`.** It throws on unequal-length buffers.
- **Generate new = new key.** Update `RAPIDAPI_WEBHOOK_SECRET` when you rotate.
- **Fail closed.** If `RAPIDAPI_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the check.
- **Up to five callback URLs** all receive every event, each with the same key.
- **Enterprise Hub only.** This is not the public marketplace.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `RAPIDAPI_WEBHOOK_SECRET` unset, or copied wrongly |
| 401 began suddenly | **Generate new** was clicked; copy the new key |
| 401 only behind a proxy | The proxy strips or renames `x-rapidapi-webhook-secret` |
| 400 after authentication | Body isn't a JSON object |
| Events log "unhandled" | `RAPIDAPI_EVENT_FIELD` unset or names the wrong field; check a **Test event** body |
