# How to Verify Digital Samba Webhook Requests

## How Does Digital Samba Authenticate Webhooks?

Digital Samba does not sign payloads. When the webhook was created with an `authorization_header`, every POST includes:

```
Authorization: Bearer <secret>
```

There is no HMAC, timestamp or signature header. The body is not part of the check, but authenticate before parsing it.

**A static shared credential authenticates the sender, not the body, and gives no replay protection** (no signature, no timestamp). Anyone who captures one request can replay it or forge new ones. Use HTTPS, make handlers idempotent, and rotate the `authorization_header` secret if it leaks. If the webhook has no `authorization_header`, there is nothing to verify.

## Implementation

Store the **bare** secret. If the configured value itself starts with `Bearer ` (case-insensitively), strip it. Do not trim or otherwise alter the secret. Require the header to start with `Bearer ` (scheme matched case-insensitively, per RFC 9110) and compare the rest to the secret in constant time.

### Node.js

```javascript
const crypto = require('crypto');

function verifyDigitalSambaRequest(headers, secret = process.env.DIGITAL_SAMBA_WEBHOOK_SECRET) {
  if (!secret) return false;
  const expected = /^bearer /i.test(secret) ? secret.slice(7) : secret;
  const header = headers['authorization'];
  if (!expected || typeof header !== 'string' || !/^bearer /i.test(header)) return false;

  const received = Buffer.from(header.slice(7), 'latin1'); // Node decodes headers as latin1
  const wanted = Buffer.from(expected, 'utf8');
  if (received.length !== wanted.length) return false;
  return crypto.timingSafeEqual(received, wanted);
}
```

In the Next.js example both sides are hashed with SHA-256 first, which is equally valid.

### Python

```python
import hmac, os

def verify_digital_samba_request(headers, secret=None) -> bool:
    secret = secret if secret is not None else os.environ.get("DIGITAL_SAMBA_WEBHOOK_SECRET")
    if not secret:
        return False
    expected = secret[7:] if secret[:7].lower() == "bearer " else secret
    header = headers.get("authorization")
    if not expected or not header or header[:7].lower() != "bearer ":
        return False
    # Bytes, never str: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(header[7:].encode("latin-1"), expected.encode("utf-8"))
```

## Common Gotchas

- **Store the bare secret.** Digital Samba adds `Bearer ` itself. Pasting `Bearer <secret>` also works here only because the examples strip the prefix.
- **Don't trim the secret.** Whitespace is part of the value.
- **Scheme is case-insensitive.** Accept `bearer`, `Bearer` and `BEARER`; the bare secret without a scheme is rejected.
- **Constant-time compare.** Check lengths (or hash both sides) before `timingSafeEqual`, which throws on unequal lengths. In Python use `hmac.compare_digest` on bytes.
- **Fail closed.** If `DIGITAL_SAMBA_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then `JSON.parse` after the check.
- **No replay protection.** Use idempotency keys such as `sessionId` + `eventType` + `timestamp` to drop duplicates.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `DIGITAL_SAMBA_WEBHOOK_SECRET` unset, or differs from the webhook's `authorization_header` |
| 401 and no Authorization header arrives | The webhook was created without `authorization_header`; edit it through the API |
| 401 only behind a proxy | The proxy strips the `Authorization` header |
| 400 after authentication | Body isn't a JSON object |
