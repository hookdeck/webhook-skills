# How to Verify Incode Webhook Requests

## How Does Incode Authenticate Webhooks?

Incode does not sign payloads: there is no HMAC, signature header, timestamp or webhook ID. You
add a custom header (key and value) in Dashboard > Configuration > Webhooks, and Incode sends it
on every webhook. Your endpoint compares that header with the value you stored.

```
X-Incode-Auth: your-secret-value
```

The header name is your choice, so the examples read it from `INCODE_WEBHOOK_HEADER` (default
`Authorization`) and the expected value from `INCODE_WEBHOOK_SECRET`.

## What Does This Protect Against?

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection**: nothing ties the credential to the payload or to a point in time, so anyone who
captures a request can resend it. Use HTTPS, rotate the credential if it leaks, and process
events idempotently (key on `interviewId` plus the event name).

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyIncodeRequest(headers, secret = process.env.INCODE_WEBHOOK_SECRET,
                             name = process.env.INCODE_WEBHOOK_HEADER || 'Authorization') {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_incode_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("INCODE_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("INCODE_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(secret and received) and hmac.compare_digest(
        received.encode("utf-8"), secret.encode("utf-8")
    )
```

## Common Gotchas

- **Compare the whole value.** If the *Custom Header Value* is `Bearer abc123`, then
  `INCODE_WEBHOOK_SECRET` is `Bearer abc123`. Do not strip or parse a `Bearer ` prefix.
- **The header name is yours.** If you leave `INCODE_WEBHOOK_HEADER` unset the handler looks at
  `Authorization`, which is also where an OIDC bearer token would arrive.
- **OIDC / OAuth is a different mechanism.** With OIDC configured, Incode sends
  `Authorization: Bearer <ACCESS_TOKEN>` with a token from your authorization server. It can't be
  matched against a fixed value and Hookdeck's Incode source does not support it.
- **Case-insensitive header lookup.** Node lowercases header names; `Headers.get` and Starlette
  are already case-insensitive.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes; passing a non-ASCII
  `str` raises `TypeError`.
- **Fail closed.** If `INCODE_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the header check.
- **Answer in JSON.** `200` with `application/json`, or `204`. Anything else makes Incode retry
  up to 5 times. This includes a plain-text `200 OK`.
- **One set of headers for all webhooks.** Every custom header goes to every webhook type, so
  don't put anything secret in a header you wouldn't want every endpoint to see.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `INCODE_WEBHOOK_SECRET` unset, or `INCODE_WEBHOOK_HEADER` doesn't match the Custom Header Key |
| 401 and the value looks right | A `Bearer ` prefix typed in the dashboard is missing from the env var (or the reverse) |
| 401 only behind a proxy | The proxy strips or renames the custom header |
| 401 with OIDC enabled | The `Authorization` header holds a rotating OAuth token, not your static value |
| Same event arrives repeatedly | The endpoint didn't answer `200` + `application/json` (or `204`) |
| 400 after authentication | Body isn't a JSON object |
