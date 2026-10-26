# How to Verify Demodesk Webhook Requests

## How Does Demodesk Authenticate Webhooks?

Demodesk does not sign payloads. There is no HMAC, signature header or timestamp. The
documentation suggests custom headers for authentication, for example
`Authorization: Bearer abc123`. You add the header to the webhook endpoint, and every request to
that endpoint carries it.

```
<your header name>: <your exact value>
```

The receiver compares the header's **whole value** with the value it stored. The header name is
user-chosen, so read it from `DEMODESK_WEBHOOK_HEADER` (default `Authorization`) and the expected
value from `DEMODESK_WEBHOOK_SECRET`. Don't strip or parse a `Bearer ` prefix; if you typed it in
Demodesk, it is part of the value.

## What a Shared Credential Does Not Give You

A static shared credential authenticates the **sender**, not the **body**. There is no signature
and no timestamp, so:

- anyone who captures a request (or the header) can replay it, and nothing in the request lets you
  detect that;
- a modified payload can't be detected.

Mitigate it: serve the endpoint over HTTPS only, use a long random value, rotate it if it leaks,
and make handlers idempotent (see webhook-handler-patterns).

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyDemodeskRequest(headers, name = process.env.DEMODESK_WEBHOOK_HEADER || 'Authorization',
                               secret = process.env.DEMODESK_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_demodesk_request(headers, name=None, secret=None) -> bool:
    name = name or os.environ.get("DEMODESK_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("DEMODESK_WEBHOOK_SECRET")
    received = headers.get(name)  # Starlette/Flask headers are case-insensitive
    if not secret or not received:
        return False
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Compare the whole value.** `Bearer abc123` and `abc123` are different values. Don't strip the
  prefix on either side.
- **Case-insensitive header name.** Node lowercases incoming names; `Headers.get()` and Starlette
  handle it for you.
- **Constant-time compare.** In Node, hash both sides (or check lengths) before `timingSafeEqual`,
  which throws on unequal lengths. In Python use `hmac.compare_digest` on **bytes**; passing `str`
  raises `TypeError` on non-ASCII input, which turns a bad request into a 500.
- **Fail closed.** If `DEMODESK_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the credential check.
- **One secret per endpoint (or the same on all).** Each event needs its own endpoint; reuse the
  same header value on all of them, or store one per endpoint.
- **Reserved headers.** `Content-Type`, `Content-Length` and `Host` can't be set as custom headers.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `DEMODESK_WEBHOOK_SECRET` unset, or `DEMODESK_WEBHOOK_HEADER` names a different header than the one added in Demodesk |
| 401 only with `Authorization` | A proxy or gateway consumes or rewrites `Authorization`; use a custom name such as `X-Demodesk-Secret` |
| 401 after editing the webhook | The value in Demodesk no longer matches `DEMODESK_WEBHOOK_SECRET` (check the `Bearer ` prefix and trailing spaces) |
| 400 after authentication | Body isn't a JSON object |
| Endpoint shows **Disabled** | Too many failed deliveries; fix the receiver, then check the endpoint in Demodesk |
