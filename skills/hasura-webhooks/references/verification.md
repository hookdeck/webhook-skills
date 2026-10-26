# How to Authenticate Hasura Event Trigger Requests

## How Does Hasura Authenticate Webhooks?

It doesn't sign them. Event Trigger requests carry only the headers you configure on the trigger
(Advanced settings > Headers), plus `Content-Type: application/json`. Authentication is a secret
header you add yourself:

```
Authorization: Bearer my-long-random-secret    # name and value are your choice
```

There is no HMAC, timestamp or algorithm. The check is: look up the configured header and compare
its **whole value** with the stored secret, in constant time.

> **Limits of a shared credential.** A static header authenticates the sender, not the body, and
> gives no replay protection (no signature, no timestamp). Use HTTPS so the header isn't exposed
> in transit, rotate the credential if it leaks, and dedupe on the payload `id`.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyHasuraRequest(headers, {
  name = process.env.HASURA_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.HASURA_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_hasura_request(headers, name=None, secret=None) -> bool:
    name = name or os.environ.get("HASURA_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("HASURA_WEBHOOK_SECRET")
    received = headers.get(name)  # Starlette headers are case-insensitive
    if not secret or not received:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Compare the whole value.** If the header is `Bearer abc`, the secret is `Bearer abc`. Don't
  strip or parse a `Bearer ` prefix.
- **Header names are case-insensitive.** Node lowercases them, so lowercase the configured name.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes.
- **Fail closed.** If `HASURA_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the check.
- **Static vs env header.** With "from env variable", the secret lives in the Hasura engine's
  environment; use the resolved value as `HASURA_WEBHOOK_SECRET`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Header not added to the trigger, or `HASURA_WEBHOOK_HEADER` names a different header |
| 401 with the right secret | `Bearer ` prefix typed on the trigger but missing from `HASURA_WEBHOOK_SECRET` |
| 401 only behind a proxy | The proxy strips or renames the header |
| Retries piling up | Non-2xx responses are retried per `retry_conf` |
| 400 after authentication | Body isn't a JSON object, or `event.op` is missing |
