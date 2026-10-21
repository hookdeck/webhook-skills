# Databricks Webhook Authentication

## How Do I Verify Databricks Webhooks?

There is **no signature**: no header, no HMAC, no timestamp. Databricks
authenticates itself to you with HTTP Basic auth, using the username and
password you set on the Webhook notification destination. Your handler must
check the `Authorization` header on every request.

```
Authorization: Basic base64(username:password)
```

## Implementation

1. Read the `Authorization` header; reject if missing or not starting with `Basic `.
2. Base64-decode the rest and split on the **first** `:` (passwords may contain `:`).
3. Compare username and password with your stored values using a constant-time comparison. Evaluate both comparisons before combining, so timing doesn't reveal which failed.
4. Return `401` on mismatch; `500` if credentials aren't configured (fail closed).

### Node.js

```javascript
const crypto = require('crypto');
const safeEqual = (a, b) => {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

function verifyDatabricksAuth(authHeader, username, password) {
  if (!authHeader || !username || !password || !authHeader.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const i = decoded.indexOf(':');
  if (i === -1) return false;
  const userOk = safeEqual(decoded.slice(0, i), username);
  const passOk = safeEqual(decoded.slice(i + 1), password);
  return userOk && passOk;
}
```

### Python

```python
import base64, binascii, hmac

def verify_databricks_auth(authorization, username, password):
    if not (authorization and username and password and authorization.startswith("Basic ")):
        return False
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
```

## Common Gotchas

- **Don't expect a signature header.** Searching for `X-Databricks-Signature` finds nothing.
- **Always set the username and password.** Without credentials there is nothing to verify, and anyone who finds your URL can post to it.
- **OAuth (Beta) is a different mode.** Databricks fetches an access token with client credentials and sends it as a bearer token; Basic and OAuth can't be combined.
- **HTTPS with a trusted CA is required.** Self-signed certificates fail.
- **Two payload shapes.** Job events use `event_type`; SQL alerts use `event: "alert_state_change"`. Don't assume `event_type` exists.
- **Ignore unknown fields.** SQL alert payloads omit fields without values.
- **Use a different credential per destination** so you can revoke one without breaking the rest.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Username/password in the env vars differ from the destination (check for trailing whitespace) |
| 401 only for some passwords | Splitting on every `:` instead of the first one |
| 500 | `DATABRICKS_WEBHOOK_USERNAME` / `_PASSWORD` not set |
| No delivery at all | Endpoint not HTTPS/trusted CA, or Databricks IPs not allowlisted |
