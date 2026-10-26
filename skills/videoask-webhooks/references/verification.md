# How to Verify VideoAsk Webhook Requests

## How Does VideoAsk Authenticate Webhooks?

It doesn't sign them. There is no HMAC, no signature header and no timestamp. Instead you add a
header of your choosing to the webhook, either with **Add a secret** in the Connect tab (header
name and value) or through the API (`headers` object on `PUT /forms/{form_id}/webhooks/{tag}`),
and VideoAsk sends it with every delivery:

```
secret: open-sesame
```

Your endpoint compares the header's whole value with the secret you stored.

## Limits of a Static Credential

A static shared credential authenticates the **sender**, not the **body**: anyone who learns it can
send any payload, and a captured request can be replayed because there is no signature and no
timestamp. So:

- Use HTTPS only.
- Rotate the credential if it leaks (update the webhook via the API and your env var).
- Make handlers idempotent (key on `event_id`); retries and replays are indistinguishable.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyVideoAskRequest(headers, {
  headerName = process.env.VIDEOASK_WEBHOOK_HEADER || 'secret',
  secret = process.env.VIDEOASK_WEBHOOK_SECRET,
} = {}) {
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

def verify_videoask_request(headers, header_name=None, secret=None) -> bool:
    header_name = header_name or os.environ.get("VIDEOASK_WEBHOOK_HEADER") or "secret"
    secret = secret if secret is not None else os.environ.get("VIDEOASK_WEBHOOK_SECRET")
    received = headers.get(header_name.lower())
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Header name is yours.** It is whatever key you put in `headers`; configure
  `VIDEOASK_WEBHOOK_HEADER` to match. Header names are case-insensitive.
- **Compare the whole value.** If you typed `Bearer abc123` as the value, `VIDEOASK_WEBHOOK_SECRET`
  is `Bearer abc123`. Do not strip or parse the prefix.
- **Two ways to set it.** The Connect tab's **Add a secret** (header name and value) and the API's
  `headers` object both set the header. The help centre calls it "signed", but no signing algorithm
  is documented: you receive the value you set and compare it. Send a test delivery to confirm the
  header arrives.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python encode both sides to bytes for `hmac.compare_digest`; passing
  `str` raises on non-ASCII.
- **Fail closed.** If `VIDEOASK_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the credential check.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret env var unset, wrong header name, or the webhook has no secret header |
| 401 with the right secret | Value differs by a `Bearer ` prefix, trailing space or quoting |
| 401 began suddenly | The webhook's secret was changed; copy the new value |
| 401 only behind a proxy | The proxy strips or renames the custom header |
| 400 after authentication | Body isn't a JSON object |
