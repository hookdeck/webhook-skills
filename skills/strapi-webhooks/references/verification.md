# How to Authenticate Strapi Webhook Requests

## Does Strapi Sign Webhooks?

No. Strapi's webhook runner sends your configured headers plus `X-Strapi-Event`, and nothing
else: no HMAC, no timestamp, no signature. The "Verifying signatures" section in Strapi's docs
(`X-Webhook-Signature` and `X-Webhook-Timestamp` over `timestamp.body`) is guidance for a sender
you build yourself. Don't look for those headers on Strapi requests; they won't be there.

What Strapi supports is a static header: set one per webhook in the admin panel, or for all
webhooks through `webhooks.defaultHeaders` in `./config/server` (the docs' example is
`Authorization: Bearer my-very-secured-token`). Your endpoint compares that header with the value
you stored.

## What This Check Does and Doesn't Give You

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection**: there is no signature over the payload and no timestamp. Anyone who captures a
request (for example through a proxy log) can resend it, or alter the body while keeping the
header. So:

- Use HTTPS only.
- Rotate the credential if it leaks, in Strapi and in your receiver together.
- Make handlers idempotent (key on `documentId` plus `event`/`createdAt`) so a replay is harmless.

## Implementation

The header name is user-chosen, so read it from `STRAPI_WEBHOOK_HEADER` (default `Authorization`)
and the expected value from `STRAPI_WEBHOOK_SECRET`. Look the header up case-insensitively and
compare the **whole** value. Do not strip or parse a `Bearer ` prefix.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyStrapiRequest(headers, secret = process.env.STRAPI_WEBHOOK_SECRET,
                             headerName = process.env.STRAPI_WEBHOOK_HEADER || 'Authorization') {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_strapi_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("STRAPI_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("STRAPI_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name.lower())
    return bool(secret and received and safe_equal(received, secret))
```

Both examples hash each side to SHA-256 first, so the comparison is over equal-length bytes.
(Alternatively, check lengths first and call `timingSafeEqual` on equal-length Buffers.)

## Common Gotchas

- **Compare the whole value.** If Strapi sends `Authorization: Bearer abc`, then
  `STRAPI_WEBHOOK_SECRET` must be `Bearer abc`. Setting it to `abc` returns 401 on every request.
- **Header name is yours.** If you didn't use `Authorization`, set `STRAPI_WEBHOOK_HEADER`.
- **Per-webhook headers override `defaultHeaders`.** A webhook that defines its own
  `Authorization` header won't get the default one.
- **Constant-time compare.** `timingSafeEqual` throws on unequal lengths; Python's
  `compare_digest` raises `TypeError` for non-ASCII `str`. Hash or encode both sides first.
- **Fail closed.** If `STRAPI_WEBHOOK_SECRET` is unset, reject everything rather than comparing
  against `undefined`.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the credential check.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `STRAPI_WEBHOOK_SECRET` unset, or missing the `Bearer ` prefix |
| 401, header looks right | `STRAPI_WEBHOOK_HEADER` doesn't match the header name set in Strapi |
| 401 only on some webhooks | Those webhooks set their own headers, overriding `defaultHeaders` |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a JSON object |
