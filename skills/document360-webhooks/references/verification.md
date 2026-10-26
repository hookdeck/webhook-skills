# How to Verify Document360 Webhook Requests

## How Does Document360 Authenticate Webhooks?

Document360 does not sign payloads: there is no HMAC, signature header or timestamp. You add a
header to the Webhook channel as a key-value pair, and Document360 sends it on every request.
Your endpoint authenticates the request by checking that header.

```
X-Docs-Secret: your-shared-secret
```

- The header **name is user-chosen**, so read it from `DOCUMENT360_WEBHOOK_HEADER` (default
  `Authorization`). Look it up case-insensitively.
- The expected value is `DOCUMENT360_WEBHOOK_SECRET`: the **exact, whole** header value,
  including any `Bearer ` prefix you typed. Compare it in full; don't strip or parse a prefix.
- A missing header or a mismatch gets `401`. This matches Hookdeck's Document360 source
  (header name plus exact whole value).

## What This Does Not Protect Against

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection** (no signature, no timestamp). Anyone who captures one request, including the secret
header, can resend it or alter the body. So:

- Serve the endpoint over HTTPS only.
- Keep the value out of logs and source control.
- **Rotate the credential** (change the channel header and your environment variable together)
  if it leaks.
- Make handlers idempotent; see the webhook-handler-patterns skill.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyDocument360Request(
  headers,
  secret = process.env.DOCUMENT360_WEBHOOK_SECRET,
  name = process.env.DOCUMENT360_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

Hashing both sides gives equal-length buffers. (Alternatively check lengths first, then
`timingSafeEqual` on equal-length Buffers.)

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    # compare_digest on bytes; passing str raises TypeError for non-ASCII
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_document360_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("DOCUMENT360_WEBHOOK_SECRET")
    if not secret:
        return False
    name = header_name or os.environ.get("DOCUMENT360_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(name)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)
```

## Common Gotchas

- **Accept POST and PUT.** The **Request method** dropdown offers both. A POST-only route
  returns 404/405 to a PUT channel. In Hookdeck, the Document360 source pre-selects POST without
  managing the method, so allow PUT on the source too.
- **Empty body.** Handle it: an authenticated request with no body should still get `200`.
- **Whole-value compare.** If the channel header is `Authorization: Bearer abc`, the expected
  value is `Bearer abc`, not `abc`.
- **Fail closed.** If `DOCUMENT360_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any **Request content** format is
  accepted, then `JSON.parse` after the credential check.
- **Display-label keys.** Fields like `Event` and `Logged on (UTC)` contain spaces and mixed case.
- **Event name drift.** The docs' sample payload says `Article settings saved` while the mapping
  list says "Article settings updated". Log unknown events and return `200`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `DOCUMENT360_WEBHOOK_SECRET` unset, or `DOCUMENT360_WEBHOOK_HEADER` doesn't match the channel's key |
| 401 with the right secret | You stripped or added a `Bearer ` prefix; compare the whole value as typed |
| 404/405 on delivery | Channel uses PUT but the route only accepts POST |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a JSON object (check the **Request content** format) |
| Nothing arrives | Events aren't mapped to the channel on the **Notification mapping** tab |
