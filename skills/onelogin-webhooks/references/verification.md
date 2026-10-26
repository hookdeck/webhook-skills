# How to Verify OneLogin Webhook Requests

## Does OneLogin Sign Webhooks?

No. The Event Broadcaster sends no signature, timestamp or HMAC. OneLogin's docs suggest adding an arbitrary secret string as a **custom header** on the broadcaster and checking that the same string arrives with each request. That header name and value are whatever you configured, so this skill reads them from `ONELOGIN_WEBHOOK_HEADER` (default `Authorization`) and `ONELOGIN_WEBHOOK_SECRET`.

```
X-Onelogin-Secret: your-long-random-string
```

## What Does This Protect Against?

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay protection**: anyone who captures one request can resend it, and the body is not bound to the credential. Mitigate by:

- using HTTPS only,
- keeping the value long and random,
- rotating it in both OneLogin and your environment if it leaks,
- making handlers idempotent (use each event's `uuid`).

## Implementation

Compare the **whole** header value exactly. Do not strip or parse a `Bearer ` prefix; if you typed one in OneLogin, it is part of the secret.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function verifyOneLoginRequest(headers,
    secret = process.env.ONELOGIN_WEBHOOK_SECRET,
    headerName = process.env.ONELOGIN_WEBHOOK_HEADER || 'Authorization') {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received.length > 0 && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_onelogin_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("ONELOGIN_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("ONELOGIN_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(secret and received) and hmac.compare_digest(
        received.encode("utf-8"), secret.encode("utf-8")
    )
```

## Common Gotchas

- **Constant-time compare.** `crypto.timingSafeEqual` throws on unequal lengths, so check lengths first (or hash both sides). `hmac.compare_digest` raises `TypeError` for non-ASCII `str`; encode both sides to bytes.
- **Whole value.** `Bearer abc` and `abc` are different secrets. Do not normalize.
- **Case-insensitive header name.** Node lower-cases incoming header names; `Headers` and Starlette handle case for you.
- **Fail closed.** If `ONELOGIN_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then parse after the credential check. The body is a JSON array (with the recommended JSON Array format type); iterate it.
- **Respond 200.** Anything else, or a timeout, triggers a retry (3 attempts max).
- **Proxies.** Headers such as `Authorization` may be stripped or rewritten by gateways. A dedicated header name avoids this.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `ONELOGIN_WEBHOOK_SECRET` unset, or header name differs from the one configured in OneLogin |
| 401 only with `Bearer` secrets | The stored secret omits (or adds) the `Bearer ` prefix the broadcaster sends |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a JSON array of objects: check the broadcaster uses the JSON Array format type |
| OneLogin keeps resending | Endpoint returned non-200 or timed out |
