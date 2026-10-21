# How to Verify Azure Logic Apps Webhook Calls

## Is There a Signature?

No. Azure Logic Apps doesn't sign HTTP action requests: there's no HMAC, no signature
header, no timestamp and no Standard Webhooks headers. Verification means checking a
credential the workflow sends and comparing it in constant time.

| Method | Header sent | Check |
|--------|-------------|-------|
| Basic | `Authorization: Basic base64(username:password)` | Decode, split on first `:`, compare both parts |
| Raw | `Authorization: <Value>` (verbatim) | Compare the whole header value |
| Custom header | `<your-header>: <secret>` | Compare the header value |
| Active Directory OAuth / Managed identity | `Authorization: Bearer <Entra ID token>` | Validate the JWT (out of scope here) |
| Client certificate | none (TLS client cert) | Validate at the TLS terminator (out of scope here) |

## Implementation

There's no Logic Apps SDK for receiving these calls; the standard library is enough.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function safeEqual(received, expected) {
  // Hash both sides: equal-length buffers, so timingSafeEqual never throws and the
  // expected value's length isn't leaked.
  const a = crypto.createHash('sha256').update(String(received), 'utf8').digest();
  const b = crypto.createHash('sha256').update(String(expected), 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

function verifyBasicAuth(authorization, username, password) {
  if (!authorization) return false;
  const match = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(authorization);
  if (!match) return false;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep === -1) return false;
  const userOk = safeEqual(decoded.slice(0, sep), username);
  const passOk = safeEqual(decoded.slice(sep + 1), password);
  return userOk && passOk;
}

function verifySharedSecret(headerValue, secret) {
  if (!headerValue || !secret) return false;
  return safeEqual(headerValue, secret);
}
```

### Python (FastAPI)

```python
import base64, binascii, hashlib, hmac

def safe_equal(received: str, expected: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(received.encode()).digest(),
        hashlib.sha256(expected.encode()).digest(),
    )

def verify_basic_auth(authorization, username, password) -> bool:
    if not authorization or not authorization.lower().startswith("basic "):
        return False
    try:
        decoded = base64.b64decode(authorization[6:].strip(), validate=True).decode()
    except (binascii.Error, UnicodeDecodeError):
        return False
    user, sep, pwd = decoded.partition(":")
    if not sep:
        return False
    user_ok = safe_equal(user, username)
    pass_ok = safe_equal(pwd, password)
    return user_ok and pass_ok
```

In FastAPI, run the check in a dependency (`Depends(authenticate_logic_app)`) so the
route only executes for authenticated calls; see
[examples/fastapi/](../examples/fastapi/).

## Common Gotchas

- **Plain `===` / `==` comparisons leak timing.** Use `crypto.timingSafeEqual` or
  `hmac.compare_digest`. `timingSafeEqual` throws on different lengths; hashing both
  sides first avoids that.
- **Split Basic credentials on the first colon.** Passwords may contain `:`;
  usernames can't.
- **Raw auth sends the Value exactly.** If you typed `Bearer abc`, the header is
  `Authorization: Bearer abc`; compare against the whole string, scheme included.
- **Don't combine Raw and Basic.** Both use the `Authorization` header.
- **Custom headers show up in run history.** Turn on **Secure Inputs** for the HTTP
  action. `Authorization` is hidden by default.
- **Fail closed.** If no credential is configured on the receiver, reject the request
  (`500`) instead of accepting everything.
- **No raw-body requirement for auth**, since nothing is signed. Still read the raw
  body yourself: the payload can be JSON, text, form-urlencoded or multipart, depending
  on the workflow.
- **No replay protection.** Nothing is timestamped. Use HTTPS, rotate credentials, and
  make the handler idempotent (have the workflow send `workflow()['run']['name']`).

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Logic App run shows `401` from the HTTP action | Credentials in the action don't match the receiver's env vars, or **Authentication** is still None |
| `401` only with Raw auth | Receiver secret missing the scheme (`Bearer `) that the Value includes, or `AZURE_LOGIC_APPS_SECRET_HEADER` not set to `Authorization` |
| `401` with a custom header | Header name mismatch; Logic Apps sends it as typed, Node and Starlette lowercase it, so configure the name case-insensitively |
| `500` from the receiver | No credentials configured (the examples fail closed) |
| Action keeps running / polling | Your endpoint returned `202`; return `200` |
| Action retried several times | Your endpoint returned `5xx`, `429` or `408`, or timed out |

Inspect the exact request Logic Apps sent with the Hookdeck CLI
(`npx hookdeck-cli listen 3000 azure-logic-apps --path /webhooks/azure-logic-apps`) or
the action's inputs in run history (Authorization is redacted there).
