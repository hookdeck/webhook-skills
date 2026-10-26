# How to Verify Soniox Webhook Requests

## How Does Soniox Authenticate Webhooks?

Soniox does not sign payloads. When you create a transcription you may set
`webhook_auth_header_name` and `webhook_auth_header_value`; Soniox then includes that header on
the webhook request. Your endpoint compares it with the value you stored.

```
Authorization: Bearer <my-secret-token>
```

(`Authorization` and the `Bearer` prefix are only the docs' example. The name and value are
whatever you chose.) There is no HMAC and no timestamp. The body is not part of the check, but
authenticate before parsing it.

> Soniox webhooks are not signed. Send webhook_auth_header_name and webhook_auth_header_value with every async transcription, and enter the same name and value here.

## What This Does and Doesn't Protect

A static shared credential authenticates the **sender**, not the **body**. Anyone who learns the
header value can send any payload, and a captured request can be replayed because there is no
signature and no timestamp. So:

- Use HTTPS only.
- Rotate the credential if it leaks: create new transcriptions with a new value and update
  `SONIOX_WEBHOOK_SECRET`.
- Treat the payload as a hint: fetch the transcript from the Soniox API by `id` instead of
  trusting anything else in the body.
- Make handlers idempotent so a replay is harmless.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifySonioxRequest(headers, {
  name = process.env.SONIOX_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.SONIOX_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_soniox_request(headers, name=None, secret=None) -> bool:
    name = name or os.environ.get("SONIOX_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("SONIOX_WEBHOOK_SECRET")
    received = {k.lower(): v for k, v in headers.items()}.get(name.lower())
    if not secret or not received:
        return False
    # compare_digest needs bytes (str raises on non-ASCII)
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Compare the whole value.** If you sent `Bearer abc`, the secret is `Bearer abc`. Don't strip
  or parse a `Bearer ` prefix.
- **Header names are case-insensitive.** Node lowercases them, so lowercase the configured name.
- **Per transcription.** The header is set on each transcription request. A transcription created
  without it sends an unauthenticated webhook, which this handler rejects.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes.
- **Fail closed.** If `SONIOX_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the header check.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `SONIOX_WEBHOOK_SECRET` unset, or differs from `webhook_auth_header_value` |
| 401, secret looks right | The `Bearer ` prefix is in one value but not the other |
| 401 for some transcriptions only | Those transcriptions were created without the header fields |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a JSON object |
