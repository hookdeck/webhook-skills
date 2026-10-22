# How to Verify JFrog Webhook Requests

## How Does JFrog Authenticate Webhooks?

When you set a secret token on a webhook and leave **use secret for signing** off (the
default, `use_secret_for_signing=false`), JFrog passes the secret **as-is** in the
`X-JFrog-Event-Auth` HTTP header. There is no payload signature in this mode. Authenticate the
request by comparing the header to your stored secret with a constant-time compare.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const token = req.headers['x-jfrog-event-auth'];
const ok = Boolean(secret) && Boolean(token) && safeEqual(token, secret);
```

### Python

```python
import hmac

def verify_jfrog_request(headers, secret: str) -> bool:
    token = headers.get("x-jfrog-event-auth")
    if not secret or not token:
        return False
    return hmac.compare_digest(token.encode("utf-8"), secret.encode("utf-8"))
```

## Signing Mode Is Not Covered

JFrog's webhook form also offers to use the secret for signing
(`use_secret_for_signing=true`), in which case the payload is signed with HMAC-SHA256 and the
secret is not sent. JFrog's documentation does not say which header carries that signature,
so this skill does not implement it. The documented way to check a signed payload is to
compute `echo -n '<payload>' | openssl sha256 -hmac "<secret>"` and compare. If you need
signing, confirm the header against a real delivery first.

## Common Gotchas

- **Token mode, not HMAC**: the header is the secret itself. Treat it like a password and only
  use HTTPS.
- **Constant-time compare**: use `crypto.timingSafeEqual` / `hmac.compare_digest`, not `===`.
  Hash both sides (Node) so differing lengths don't throw.
- **Never accept when unconfigured**: if `JFROG_WEBHOOK_SECRET` is empty, reject everything.
- **Any content type**: read the body raw (`express.raw({ type: '*/*' })`) and parse it
  yourself, so a content type JFrog or a custom webhook sets never skips the handler.
- **Header names are case-insensitive**: Node lowercases them (`x-jfrog-event-auth`).
- **Custom webhooks**: if you add your own headers, `X-JFrog-Event-Auth` is still the secret
  header when signing is off.

## Debugging 401s

- Open the webhook's **Troubleshooting** tab for the status your endpoint returned.
- Confirm **use secret for signing** is off. If it's on, no `X-JFrog-Event-Auth` header is
  sent and every request will fail this check.
- Compare the secret byte for byte (trailing whitespace or newline in `.env`).
- Check that no proxy strips the `X-JFrog-Event-Auth` header.
