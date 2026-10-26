# How to Verify Datacake Webhook Requests

## How Does Datacake Authenticate Webhooks?

Datacake does not sign payloads: there is no HMAC, signature header or timestamp. Instead you add a
custom HTTP header under **Headers** on the webhook, and every request carries it. Datacake's
guidance: authenticate with an HTTP header (`Authorization` or any custom header name) whose value
is a secret token known to both Datacake and the receiver.

```
Authorization: Bearer ABC123
```

The header name is user-chosen, so read it from configuration. The value is compared as one whole
string. The raw body is not part of the check, but authenticate before parsing it.

> A static shared secret authenticates the sender, not the body, and gives no replay protection:
> there is no signature and no timestamp, so a captured request can be replayed. Use HTTPS, make the
> secret long and unguessable, rotate it if it leaks, and make handlers idempotent.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(received, expected) {
  const ha = crypto.createHash('sha256').update(Buffer.from(received, 'latin1')).digest();
  const hb = crypto.createHash('sha256').update(Buffer.from(expected, 'utf8')).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyDatacakeRequest(
  headers,
  headerName = process.env.DATACAKE_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.DATACAKE_WEBHOOK_SECRET
) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received.length > 0 && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def safe_equal(received: str, expected: str) -> bool:
    # bytes on both sides: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(
        received.encode("latin-1", errors="replace"), expected.encode("utf-8")
    )

def verify_datacake_request(headers, header_name=None, secret=None) -> bool:
    header_name = header_name or os.environ.get("DATACAKE_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("DATACAKE_WEBHOOK_SECRET")
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Compare the whole value.** If you typed `Bearer ABC123` in Datacake, set
  `DATACAKE_WEBHOOK_SECRET` to `Bearer ABC123`. Don't strip or parse the prefix.
- **Header names are case-insensitive.** Node, Next.js and Starlette normalize or ignore case; in
  Node-RED, `msg.req.headers` names are always lowercase. Look the name up case-insensitively.
- **Whitespace.** Stray spaces or newlines in the header value (in Datacake or in your env file)
  cause mismatches.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python, use `hmac.compare_digest` on bytes.
- **Fail closed.** If `DATACAKE_WEBHOOK_SECRET` is unset, reject everything rather than comparing
  against `undefined`.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the header check.
- **No IP allowlist.** Datacake's IPs change as its infrastructure scales.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `DATACAKE_WEBHOOK_SECRET` unset, or the header isn't set under **Headers** in Datacake |
| 401 with the right token | Missing or extra `Bearer ` prefix, or `DATACAKE_WEBHOOK_HEADER` names a different header |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a JSON object |
