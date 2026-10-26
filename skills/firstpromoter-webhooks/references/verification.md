# How to Authenticate FirstPromoter Webhook Requests

## How Does FirstPromoter Authenticate Webhooks?

It doesn't sign them. Webhooks v2 subscriptions accept a `headers` object, "custom HTTP headers
to include on every request. Useful for API keys or authorization tokens your endpoint
requires." You add a secret header and your endpoint checks it.

Covers Webhooks v2 only: add a custom header to the subscription and enter it here. Legacy webhooks cannot send custom headers.

There is no HMAC, timestamp or prefix convention. The header name is yours
(`FIRSTPROMOTER_WEBHOOK_HEADER`, default `Authorization`) and the expected value is the exact,
whole header value (`FIRSTPROMOTER_WEBHOOK_SECRET`), including any `Bearer ` you typed. This is
how Hookdeck's FirstPromoter source works too (header name plus exact whole header value).

> **A static shared credential authenticates the sender, not the body, and gives no replay
> protection** (no signature, no timestamp). Anyone who captures one request can replay it.
> Use HTTPS, rotate the credential if it leaks, and dedupe on `event_id`.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyFirstPromoterRequest(headers, secret = process.env.FIRSTPROMOTER_WEBHOOK_SECRET,
    name = process.env.FIRSTPROMOTER_WEBHOOK_HEADER || 'Authorization') {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

(Checking lengths first and then `crypto.timingSafeEqual` on equal-length Buffers works too.)

### Python

```python
import hmac, os

def verify_firstpromoter_request(headers, secret=None, name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("FIRSTPROMOTER_WEBHOOK_SECRET", "")
    name = name or os.environ.get("FIRSTPROMOTER_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(name)  # Starlette headers are case-insensitive
    if not secret or not received:
        return False
    # Bytes, not str: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Compare the whole value.** Don't strip or parse `Bearer `. If you set
  `Authorization: Bearer abc`, `FIRSTPROMOTER_WEBHOOK_SECRET` is `Bearer abc`.
- **Header lookup is case-insensitive.** Node lowercases names; use `name.toLowerCase()`.
- **Constant-time compare.** `timingSafeEqual` throws on unequal lengths, so hash both sides or
  check lengths first. In Python never pass `str` to `compare_digest`.
- **Fail closed.** If the secret is unset, reject everything.
- **Legacy webhooks can't be verified.** They cannot send custom headers; move to v2.
- **Raw body.** Read with `express.raw({ type: '*/*' })`, authenticate, then `JSON.parse`.
- **Auth before JSON errors.** Unauthenticated bad JSON gets 401, not 400.
- **Dedupe.** Retries redeliver the same `event_id`; ignore a repeat.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret unset, wrong header name, or value missing the `Bearer ` prefix you typed |
| 401 only on some requests | Subscription header was edited but the env var wasn't |
| 401 behind a proxy | The proxy strips or renames the header (some drop `Authorization`) |
| Legacy webhooks always 401 | They can't send custom headers; use a v2 subscription |
| 400 after authentication | Body isn't a JSON object |
