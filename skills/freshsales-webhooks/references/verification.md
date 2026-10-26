# How to Verify Freshsales Webhook Requests

## Does Freshsales Sign Webhooks?

No. Freshsales webhooks carry no signature, no signing secret and no timestamp. The only way to
authenticate them is a secret you add yourself, as a custom header on the Trigger webhook action:

```
X-Webhook-Secret: <secret>
```

Freshsales accepts custom headers as `X-Sample-CustomHeader1: VALUE` pairs, one per line. The
header name is yours to choose (`FRESHSALES_WEBHOOK_HEADER`, default `X-Webhook-Secret`); the
expected value is `FRESHSALES_WEBHOOK_SECRET`.

Freshsales also has an optional **Authentication** field (username and password, or an API key).
Its delivery format isn't documented, so use a custom header instead.

## What Does a Static Secret Protect?

A static shared credential **authenticates the sender, not the body**, and gives **no replay
protection**: there's no signature over the payload and no timestamp, so anyone who captures one
request can replay it, and the body can't be proven unmodified. Use HTTPS only, keep the secret out
of logs, make handlers idempotent, and rotate the secret if it leaks.

## Implementation

Compare the **whole** header value with the exact secret in constant time. Don't strip or parse a
`Bearer ` prefix: whatever you typed is the secret. Missing header or mismatch returns `401`.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyFreshsalesRequest(headers, secret = process.env.FRESHSALES_WEBHOOK_SECRET,
    headerName = process.env.FRESHSALES_WEBHOOK_HEADER || 'X-Webhook-Secret') {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    # Encode to bytes: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_freshsales_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("FRESHSALES_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("FRESHSALES_WEBHOOK_HEADER") or "X-Webhook-Secret"
    received = headers.get(header_name.lower())
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Don't expect a signature.** There's no `X-Freshsales-Signature` or similar header.
- **No spaces in the header.** Freshsales doesn't run the trigger if the custom header contains
  spaces in between. Use a hex secret, not `Bearer abc`. A header with several values needs
  delimiters other than comma or colon.
- **Compare the whole value.** If you typed a prefix such as `Bearer `, it's part of the secret.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python, compare bytes.
- **Fail closed.** If `FRESHSALES_WEBHOOK_SECRET` is unset, reject everything.
- **Any method, any content type.** The request type is user-chosen and GET/DELETE have no body.
  Read the body raw (`express.raw({ type: '*/*' })`), check the header, then parse.
- **Respond within 6 seconds.** Do slow work after returning `200`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret unset in your app, or header name differs from `FRESHSALES_WEBHOOK_HEADER` |
| 401 only with a `Bearer ` value | App stores the secret without the prefix you typed in Freshsales (or the reverse) |
| Webhook never reaches the endpoint | A space in the header, a wrong Callback URL, or the workflow is disabled |
| 405 / 404 on GET or DELETE | The route only accepts POST: accept all five methods |
| 400 after authenticating | Encoding isn't JSON, or the Advanced content isn't valid JSON |
| Test works, real events 404 downstream | Test sends sample placeholder data like `12345` |
