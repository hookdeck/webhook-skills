# How to Verify Prefect Custom Webhook Requests

## How Does Prefect Authenticate Webhooks?

It doesn't sign them. The Custom Webhook block sends whatever `headers` you configured, so you
add a secret header yourself and check it on receipt. The header name is yours, hence the
`PREFECT_WEBHOOK_HEADER` variable (default `Authorization`).

```
X-Prefect-Secret: your-shared-secret
```

There is no HMAC, timestamp or event field. Compare the **whole** header value with
`PREFECT_WEBHOOK_SECRET`. If you typed `Bearer abc` in the block, the value is `Bearer abc`; do
not strip or parse the `Bearer ` prefix. This matches Hookdeck's Prefect source (header name +
exact value). Missing header or mismatch: `401`.

> A static shared credential authenticates the **sender**, not the **body**, and gives **no
> replay protection** (no signature, no timestamp). Use HTTPS, and rotate the credential if it
> leaks. Idempotent handlers limit what a replay can do.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyPrefectRequest(
  headers,
  secret = process.env.PREFECT_WEBHOOK_SECRET,
  headerName = process.env.PREFECT_WEBHOOK_HEADER || 'Authorization'
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
    # Encode to bytes: compare_digest on str raises TypeError for non-ASCII.
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_prefect_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("PREFECT_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("PREFECT_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Compare the whole value.** The secret includes any `Bearer ` prefix you typed in the block.
- **Header names are case-insensitive.** Node lowercases them; look up the lowercased name.
- **The method is configurable.** Accept POST, PUT, PATCH and GET, and handle an empty body.
- **Any content type.** `json_data` sends JSON, a `form_data` dict sends
  `application/x-www-form-urlencoded`. In Express use `express.raw({ type: '*/*' })`, check the
  credential, then parse.
- **Fail closed.** If `PREFECT_WEBHOOK_SECRET` is unset, reject everything.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths.
- **No replay protection.** Nothing in the request proves freshness.

## Debugging 401s

1. Compare the rendered header in the block to `PREFECT_WEBHOOK_SECRET`, byte for byte, including
   `Bearer `, whitespace and any `{{secret}}` substitution.
2. Confirm `PREFECT_WEBHOOK_HEADER` matches the header name in the block (or is unset and the block
   uses `Authorization`).
3. Make sure a proxy isn't stripping or replacing `Authorization`; a custom header name avoids it.
4. Replay a request from the Hookdeck CLI dashboard to see the exact headers Prefect sent.
