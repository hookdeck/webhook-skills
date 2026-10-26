# How to Verify Jamf Pro Webhook Requests

## How Does Jamf Pro Authenticate Webhooks?

This skill authenticates Jamf Pro webhooks with **Header Authentication**. You enter a JSON object
of header names and values on the webhook; Jamf Pro sends them on every request.

```
Authorization: Bearer your-long-random-secret
```

The header name is whatever you chose as the JSON key. There is no HMAC, timestamp or prefix
parsing: compare the **whole** header value with the value you stored.

> Choose Header Authentication on the Jamf Pro webhook and enter the same header name and value here.

### What this does and doesn't protect

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection** (no signature, no timestamp). Anyone who captures one request can resend it. Use
HTTPS, keep the value secret, make handlers idempotent, and rotate the credential if it leaks.

Basic authentication, mTLS and the Hash Signature option are not covered. The Hash Signature header
and its signed content aren't publicly documented.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyJamfProRequest(headers, name = process.env.JAMF_PRO_WEBHOOK_HEADER || 'Authorization',
                              secret = process.env.JAMF_PRO_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import os
from hmac import compare_digest

def verify_jamf_pro_request(headers, name=None, secret=None) -> bool:
    name = name or os.environ.get("JAMF_PRO_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("JAMF_PRO_WEBHOOK_SECRET")
    received = headers.get(name)  # use a case-insensitive headers object
    return bool(secret and received and compare_digest(received.encode(), secret.encode()))
```

## Common Gotchas

- **Compare the whole value.** If you typed `Bearer abc`, the header is `Bearer abc`; the expected
  value is `Bearer abc`. Don't strip or parse the prefix.
- **The header name is yours.** It isn't fixed by Jamf Pro. Read it from `JAMF_PRO_WEBHOOK_HEADER`
  and look it up case-insensitively.
- **Constant-time compare.** Hash both sides (or check lengths) before `crypto.timingSafeEqual`,
  which throws on unequal lengths. In Python, encode both sides to bytes for `hmac.compare_digest`;
  passing `str` raises `TypeError` on non-ASCII.
- **Fail closed.** If `JAMF_PRO_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the header check.
- **JSON is assumed.** A webhook set to XML gets a `400` after authentication; switch it to JSON.
- **Valid JSON, no auth, is still 401.** Authentication runs before the body is parsed.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `JAMF_PRO_WEBHOOK_SECRET` unset, or the header name/value differs from the Jamf Pro JSON |
| 401, value looks right | The `Bearer ` prefix was dropped from one side, or there is trailing whitespace |
| 401 only behind a proxy | The proxy strips or renames the header |
| 401 after rotating | Jamf Pro and the endpoint hold different values |
| 400 after authentication | The webhook sends XML, or the body isn't a JSON object |
