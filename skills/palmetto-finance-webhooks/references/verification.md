# How to Verify Palmetto Finance Webhook Requests

## How Does Palmetto Finance Authenticate Webhooks?

Palmetto Finance does not sign payloads. There are three mechanisms; this skill covers the
default, the **server API key**: Palmetto generates an API key, returns it once from the
registration endpoint, and sends it on every webhook in a header.

```
apiKey: <server API key>
```

The registration section of Palmetto's guide calls the header `api_key`, and the API
reference's example request carries both `api_key` and `apiKey` with the same value, so the name
is configurable here (`PALMETTO_FINANCE_WEBHOOK_HEADER`, default `apiKey`). Not covered by this
skill: **client headers** (`clientId` and `clientSecret` in the guide, `client_id` and
`client_secret` in the API reference) and **client basic authorization** (`Authorization:
Basic base64(clientId:clientSecret)`).

There is no HMAC, timestamp or prefix. The raw body is not part of the check, but authenticate
before parsing it.

## What Does This Check Not Protect Against?

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp). Anyone who sees a request can resend it with the same
key, and a modified body still passes. Use HTTPS, make your handlers idempotent, and rotate the
credential if it leaks.

## Implementation

Compare the **whole** header value in constant time. Don't strip or parse a `Bearer ` prefix: if
the header value is `Bearer abc`, the expected secret is `Bearer abc`.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyPalmettoFinanceRequest(
  headers,
  secret = process.env.PALMETTO_FINANCE_WEBHOOK_SECRET,
  headerName = process.env.PALMETTO_FINANCE_WEBHOOK_HEADER || 'apiKey'
) {
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

def verify_palmetto_finance_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("PALMETTO_FINANCE_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("PALMETTO_FINANCE_WEBHOOK_HEADER") or "apiKey"
    received = headers.get(header_name)
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **The key is shown once.** If you didn't store it at registration, create a new registration.
- **Header name.** `apiKey` by default; the API reference example also shows `api_key`. Some
  proxies drop headers containing underscores, so prefer `apiKey` where you can.
- **Check every method first.** The subscription's `httpMethod` may be `PUT` rather than
  `POST`, and a request without a body should still be authenticated. Authenticate before looking at the body.
- **Hookdeck source methods.** Allow your subscription's method on the Hookdeck source ([custom methods](https://hookdeck.com/docs/sources#custom-methods)).
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `compare_digest` on bytes, never `str` (non-ASCII
  raises).
- **Fail closed.** If the secret is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted,
  then `JSON.parse` after the check.
- **A 401 is final.** Palmetto doesn't retry 4xx other than 429, and 10 failures disable the
  subscription.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `PALMETTO_FINANCE_WEBHOOK_SECRET` unset or wrong, or the key was lost after the first response |
| 401 but the key looks right | Wrong header name: try `api_key`, or a proxy stripped the header |
| 401 with a `Bearer` value | The whole value, prefix included, must be in the secret |
| 401 only on GET or DELETE | The check ran after body handling, or the method isn't routed |
| Non-POST deliveries fail through Hookdeck | Allow the subscription's method on the Hookdeck source |
| 400 after authentication | Body isn't a JSON object |
| Deliveries stop | 10 failures disabled the subscription; re-enable it and replay skipped events |
