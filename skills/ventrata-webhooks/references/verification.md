# How to Verify Ventrata Webhook Requests

## How Does Ventrata Authenticate Webhooks?

It doesn't sign them. Ventrata documents no signature header, no algorithm and no timestamp. When
you create a webhook through the OCTO API you can give it a `headers` map, and Ventrata sends
those headers on every delivery:

```
X-Webhook-Secret: your-secret-value
```

The header name and value are yours. Your endpoint compares the received value with the one you
stored. This is also how Hookdeck's Ventrata source works (API key verification: header name plus
the exact, whole header value).

**A static shared credential authenticates the sender, not the body, and gives no replay
protection** (no signature, no timestamp). Anyone who learns it can send forged or replayed
requests. Use HTTPS, keep it out of logs, and rotate it if it leaks.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyVentrataRequest(headers, secret = process.env.VENTRATA_WEBHOOK_SECRET,
    headerName = process.env.VENTRATA_WEBHOOK_HEADER || 'X-Webhook-Secret') {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

(Hashing both sides gives equal-length buffers; you can instead check lengths and call
`crypto.timingSafeEqual` on equal-length Buffers.)

### Python

```python
import hashlib, hmac, os

def verify_ventrata_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("VENTRATA_WEBHOOK_SECRET", "")
    header_name = header_name or os.environ.get("VENTRATA_WEBHOOK_HEADER") or "X-Webhook-Secret"
    received = headers.get(header_name)  # starlette headers are case-insensitive
    if not secret or not received:
        return False
    # compare_digest on bytes: str with non-ASCII characters raises TypeError
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Compare the whole value.** If you set `"Authorization": "Bearer abc"` in the headers map,
  `VENTRATA_WEBHOOK_SECRET` is `Bearer abc`. Don't strip or parse the prefix.
- **Header names are case-insensitive.** Look the header up case-insensitively; Node lowercases
  incoming names, so lowercase the configured name.
- **The name is user-chosen.** Don't hard-code `X-Webhook-Secret`; read `VENTRATA_WEBHOOK_HEADER`.
- **`whsec_` is just a string.** The `whsec_123456abcdef` in Ventrata's example is an arbitrary
  value, not a signing secret, and nothing is computed from it.
- **Fail closed.** If `VENTRATA_WEBHOOK_SECRET` is unset, reject everything.
- **Constant-time compare.** `timingSafeEqual` throws on unequal lengths; hash both sides or check
  lengths first. In Python, pass bytes to `hmac.compare_digest`.
- **Raw body, any content type.** Read it raw (`express.raw({ type: '*/*' })`), authenticate, then
  `JSON.parse`.
- **Accept both event spellings.** `booking_update` and `booking.updated` both occur in the docs.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `VENTRATA_WEBHOOK_SECRET` unset, or `VENTRATA_WEBHOOK_HEADER` doesn't match the `headers` key |
| 401, secrets look equal | A `Bearer ` prefix (or other text) in the stored header value is missing from the env var |
| 401 after rotating | Webhook was patched but the env var wasn't updated (or vice versa) |
| 401 only behind a proxy | The proxy strips custom headers |
| 400 after authentication | Body isn't a JSON object |
