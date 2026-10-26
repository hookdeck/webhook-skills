# How to Verify GOV.UK Notify Callbacks

## How Does GOV.UK Notify Authenticate Callbacks?

Notify does not sign payloads. When you configure a callback you provide a URL and a bearer token,
and Notify sends the token on every request:

```
Authorization: Bearer your-token
```

There is no HMAC and no timestamp. The body is not part of the check, but authenticate before
parsing it.

**A static shared credential authenticates the sender, not the body, and gives no replay
protection** (no signature, no timestamp). Use HTTPS, and rotate the token in Notify (and in your
configuration) if it leaks.

## Implementation

The secret (`GOVUK_NOTIFY_WEBHOOK_SECRET`) is the **bare** token. If the configured value itself
starts with `Bearer ` (case-insensitively) it is stripped, as Hookdeck does. The `Authorization`
header must start with `Bearer `, matched case-insensitively (auth schemes are case-insensitive,
RFC 9110); the remainder is compared to the secret in constant time. Neither side is trimmed.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyNotifyRequest(headers, secret = process.env.GOVUK_NOTIFY_WEBHOOK_SECRET) {
  if (!secret) return false;
  const expected = secret.toLowerCase().startsWith('bearer ') ? secret.slice(7) : secret;
  const header = headers['authorization'];
  if (!expected || typeof header !== 'string' || !header.toLowerCase().startsWith('bearer ')) return false;
  return safeEqual(header.slice(7), expected);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: bytes, b: bytes) -> bool:
    # compare_digest on bytes: str raises TypeError on non-ASCII
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())

def verify_notify_request(headers, secret=None) -> bool:
    secret = secret if secret is not None else os.environ.get("GOVUK_NOTIFY_WEBHOOK_SECRET")
    if not secret:
        return False
    expected = secret[7:] if secret.lower().startswith("bearer ") else secret
    header = headers.get("authorization")
    if not expected or not header or not header.lower().startswith("bearer "):
        return False
    return safe_equal(header[7:].encode(), expected.encode())
```

## Common Gotchas

- **Store the bare token.** Put just the token in `GOVUK_NOTIFY_WEBHOOK_SECRET`, not
  `Bearer <token>` (a leading `Bearer ` is tolerated and stripped).
- **Scheme case-insensitive, token case-sensitive.** `bearer`, `Bearer` and `BEARER` all match;
  the token must match exactly.
- **Don't trim.** Whitespace is part of the value; altering it would accept requests Notify
  wouldn't send.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes.
- **Fail closed.** If the secret is unset or empty, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the check.
- **No replay protection.** Retries (every 5 minutes, up to 5 times) look identical to replays;
  make handlers idempotent.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `GOVUK_NOTIFY_WEBHOOK_SECRET` unset, or differs from the token set in Notify |
| 401 only behind a proxy | The proxy strips or rewrites `Authorization` |
| 401 after rotating the token | Update the secret in your configuration too |
| 400 after authentication | Body isn't a JSON object |
