# How to Verify Brevo Webhooks

## Does Brevo Sign Webhooks?

No. Brevo does not send a signature header or HMAC. There is nothing to compute
over the body. Authenticity comes from credentials you configure on the webhook,
plus network restrictions:

1. **Basic auth**: credentials in the notify URL
2. **Bearer token**: `auth: {type: "bearer", token}` on the webhook
3. **Custom headers**: arbitrary `headers` on the webhook (e.g. for Cloudflare Access)
4. **IP allowlist**: only accept Brevo's published IP ranges

Use at least one credential method and, where you can, the IP allowlist.

## How It Works

### Basic auth

Create the webhook with `https://username:password@your-domain.com/webhooks/brevo`.
Brevo sends the credentials as a standard header:

```
Authorization: Basic base64(username:password)
```

Decode, split on the **first** colon (passwords may contain `:`), and compare
both parts timing-safe.

### Bearer token

Create the webhook with `"auth": {"type": "bearer", "token": "<token>"}`. Brevo sends:

```
Authorization: Bearer <token>
```

### Custom headers

Create the webhook with `"headers": [{"key": "x-brevo-secret", "value": "<secret>"}]`.
Brevo sends each header on every delivery; read it and compare timing-safe.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function verifyBrevoAuth(authHeader, { username, password, token } = {}) {
  if (!authHeader) return false;
  if (token && authHeader.startsWith('Bearer ')) {
    return safeEqual(authHeader.slice(7), token);
  }
  if (username && password && authHeader.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const i = decoded.indexOf(':');
    if (i === -1) return false;
    const userOk = safeEqual(decoded.slice(0, i), username);
    const passOk = safeEqual(decoded.slice(i + 1), password);
    return userOk && passOk;
  }
  return false;
}
```

### Python

```python
import base64, binascii, hmac

def verify_brevo_auth(authorization, username=None, password=None, token=None) -> bool:
    if not authorization:
        return False
    if token and authorization.startswith("Bearer "):
        return hmac.compare_digest(authorization[7:].encode(), token.encode())
    if username and password and authorization.startswith("Basic "):
        try:
            decoded = base64.b64decode(authorization[6:], validate=True).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError):
            return False
        if ":" not in decoded:
            return False
        user, _, pw = decoded.partition(":")
        user_ok = hmac.compare_digest(user.encode(), username.encode())
        pass_ok = hmac.compare_digest(pw.encode(), password.encode())
        return user_ok and pass_ok
    return False
```

There is no official Brevo SDK helper for webhook verification, because there
is no signature to verify. The examples use the code above directly.

## Common Gotchas

- **Looking for a signature header.** There isn't one. `X-Brevo-Signature` and
  `X-Sib-Signature` do not exist.
- **Non-constant-time comparison.** Use `crypto.timingSafeEqual` /
  `hmac.compare_digest`, never `===` / `==`.
- **Splitting on every colon.** Split Basic credentials on the first colon only.
- **URL-encoding.** Special characters in URL-embedded credentials must be
  percent-encoded when you register the URL; the decoded values are what your
  server receives. Prefer URL-safe random strings.
- **Failing open.** If no credential is configured, reject the request (the
  examples return `500`) instead of accepting anything.
- **Proxies stripping `Authorization`.** Some proxies and serverless platforms
  drop or rewrite the header. Use a custom header if that happens.
- **Raw body.** Because there's no body signature, normal JSON parsing is fine.
  Accept both an object and an array (batched webhooks).

## Debugging Verification Failures

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `401` on every request | Wrong env vars, or webhook created without auth | Check `BREVO_WEBHOOK_*` and the webhook's URL/`auth` via `GET /v3/webhooks/{id}` |
| No `Authorization` header arrives | Credentials missing from URL, or stripped by a proxy | Recreate the webhook with credentials; check proxy config |
| `Bearer` sent but server expects Basic | Mismatched method | Set the env var that matches the configured method |
| `500 Webhook authentication not configured` | No credential env vars | Set `BREVO_WEBHOOK_USERNAME`/`PASSWORD` or `BREVO_WEBHOOK_TOKEN` |

Inspect the exact headers Brevo sends with the Hookdeck CLI web UI:

```bash
npx hookdeck-cli listen 3000 brevo --path /webhooks/brevo
```
