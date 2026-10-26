# How to Verify People Data Labs Webhook Requests

## How Does PDL Authenticate Webhooks?

PDL does not sign payloads. There is no signature header, HMAC or timestamp. The only
authentication is the header (or headers) registered with the webhook, which PDL's docs say
should contain "a shared key for secure authorization", for example
`"Authorization": "Bearer pk_1312323123131231"`.

```
Authorization: Bearer pk_1312323123131231
```

The header name is chosen by you, so the examples read it from
`PEOPLE_DATA_LABS_WEBHOOK_HEADER` (default `Authorization`) and compare it with
`PEOPLE_DATA_LABS_WEBHOOK_SECRET`. This matches Hookdeck's People Data Labs source (header name
plus exact whole value).

**What this does and doesn't give you:** a static shared credential authenticates the sender, not
the body, and gives no replay protection (no signature, no timestamp). A captured request can be
replayed and the body could be altered by anyone who holds the credential. Use HTTPS only, and
ask PDL to rotate the credential if it leaks.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyPdlRequest(headers, name, secret) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac

def verify_pdl_request(headers, name: str, secret: str) -> bool:
    received = headers.get(name)  # Starlette headers are case-insensitive
    if not secret or not received:
        return False
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

`hmac.compare_digest` raises on non-ASCII `str`, so always encode both sides to bytes.

## Common Gotchas

- **Compare the whole value.** If the secret is `Bearer abc`, the expected value is
  `Bearer abc`. Do not strip or parse the prefix.
- **Header name is yours.** If PDL was told to send `X-PDL-Key`, set
  `PEOPLE_DATA_LABS_WEBHOOK_HEADER=X-PDL-Key`. Lookup is case-insensitive.
- **Constant-time compare.** Check lengths first or hash both sides before `timingSafeEqual`,
  which throws on unequal lengths.
- **Fail closed.** If the secret is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type works, check the
  header, then `JSON.parse`. The body is an array, not an object.
- **No replay protection.** Make handling idempotent (dedupe IDs) because the same batch can be
  sent twice, for example after a manual resend.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret unset, wrong header name, or the `Bearer ` prefix missing from the secret |
| 401 only behind a proxy | The proxy strips or renames the header (a proxy often rewrites `Authorization`) |
| 401 after rotation | PDL still sends the old value; confirm with your PDL team |
| 400 after authentication | Body isn't a JSON array |
