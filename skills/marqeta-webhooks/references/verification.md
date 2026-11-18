# Marqeta Webhook Verification

## Basic Auth (Required)

Every webhook has `basic_auth_username` and `basic_auth_password`, and Marqeta sends them as `Authorization: Basic base64(username:password)`.

```javascript
const crypto = require('crypto');

const safeEqual = (a, b) => crypto.timingSafeEqual(
  crypto.createHash('sha256').update(a).digest(),
  crypto.createHash('sha256').update(b).digest());

function verifyBasicAuth(authorization, username, password) {
  const match = /^Basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(String(authorization || ''));
  if (!match || !username || !password) return false;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  const userOk = safeEqual(decoded.slice(0, i), username);
  const passOk = safeEqual(decoded.slice(i + 1), password);
  return userOk && passOk;
}
```

- Split at the first colon: the password can contain `:`.
- Compare both parts in constant time and evaluate both before combining.

## X-Marqeta-Signature (Optional)

| Part | Value |
|---|---|
| Header | `X-Marqeta-Signature` |
| Algorithm | HMAC-SHA256 (`HMAC_SHA_256`) or HMAC-SHA1 (`HMAC_SHA_1`, legacy), set per webhook |
| Value | Lowercase hex (64 or 40 characters), no prefix |
| Key | The webhook's `secret`, as text |
| Signed content | The raw request body |
| Timestamp | None |

```javascript
function verifyMarqetaSignature(rawBody, signature, secret, algorithm = 'sha256') {
  const value = String(signature || '').trim();
  const length = algorithm === 'sha1' ? 40 : 64;
  if (!secret || value.length !== length || !/^[0-9a-fA-F]+$/.test(value)) return false;
  const expected = crypto.createHmac(algorithm, secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'hex'), expected);
}
```

```python
import hashlib, hmac

def verify_marqeta_signature(raw_body: bytes, signature: str, secret: str, algorithm: str = "sha256") -> bool:
    value = (signature or "").strip()
    expected = hmac.new(secret.encode(), raw_body, getattr(hashlib, algorithm)).hexdigest()
    return bool(secret) and hmac.compare_digest(value.lower(), expected)
```

### Switching from HMAC-SHA1 to HMAC-SHA256

Marqeta retries failed notifications for up to two weeks, so messages signed with the old algorithm can keep arriving after the switch. The guide recommends accepting both during that time. The examples do this with `MARQETA_SIGNATURE_ALGORITHM=sha256,sha1`.

### Hookdeck

The Hookdeck Marqeta source type checks Basic auth only. If you use a secret, check `X-Marqeta-Signature` in your handler.

## Debugging

| Symptom | Cause |
|---|---|
| Every request returns 401 | Username or password differs from the webhook's (they're masked in API responses, so check what you stored) |
| Signature fails on every request | The body was parsed and re-serialised. HMAC the raw bytes |
| Signature fails on some requests | Retries signed with the previous algorithm after a switch |
| No `X-Marqeta-Signature` header | The webhook has no `secret` |
| Endpoint changes don't take effect | Webhook URLs are cached for up to an hour |
