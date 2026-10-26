# How to Verify Leonardo.Ai Webhook Requests

## How Does Leonardo.Ai Authenticate Webhooks?

Leonardo.Ai does not sign payloads. If you set a webhook callback API key, it is added to the
header of the request as `Authorization: Bearer <key>`. Compare it with the key you stored.

```
Authorization: Bearer your-webhook-callback-api-key
```

There is no HMAC and no timestamp header. The body is not part of the check, but authenticate
before parsing it.

**A static shared credential authenticates the sender, not the body, and gives no replay
protection** (no signature, no timestamp). Anyone who captures one request can replay it or send a
different body with the same header. Use HTTPS only, and rotate the key (a new production API key)
if it leaks.

## Implementation

Store the bare key in `LEONARDO_AI_WEBHOOK_SECRET`. If the configured value itself starts with
`Bearer ` (any case), strip it, as Hookdeck does. Require the header to start with `Bearer `
(compared case-insensitively, RFC 9110), then compare the rest to the key in constant time. Don't
trim or otherwise alter the key.

### Node.js

```javascript
const crypto = require('crypto');

function verifyLeonardoRequest(headers, configured = process.env.LEONARDO_AI_WEBHOOK_SECRET) {
  if (!configured) return false;
  const secret = /^bearer /i.test(configured) ? configured.slice(7) : configured;
  if (!secret) return false; // a configured value of just "Bearer " must not match
  const header = headers['authorization'] || '';
  if (!/^bearer /i.test(header)) return false;
  const received = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

### Python

```python
import hmac, os, re

def verify_leonardo_request(headers, configured=None) -> bool:
    configured = configured if configured is not None else os.environ.get("LEONARDO_AI_WEBHOOK_SECRET", "")
    if not configured:
        return False
    secret = configured[7:] if re.match(r"bearer ", configured, re.I) else configured
    if not secret:
        return False  # a configured value of just "Bearer " must not match
    header = headers.get("authorization", "")
    if not re.match(r"bearer ", header, re.I):
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(header[7:].encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Store only the key.** Leave `Bearer ` out of `LEONARDO_AI_WEBHOOK_SECRET`.
- **Scheme case.** `bearer`, `Bearer` and `BEARER` are all valid; compare case-insensitively.
- **Constant-time compare.** `timingSafeEqual` throws on unequal lengths, so check lengths first.
  In Python use `hmac.compare_digest` on bytes, not `str`.
- **Fail closed.** If the secret is unset, reject everything.
- **Rotation needs a new production API key.** The callback key can't be edited in place.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the check.
- **Don't log the payload.** The documented sample embeds the callback key in `data.object.apiKey`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `LEONARDO_AI_WEBHOOK_SECRET` unset, or a different key than the one on the production API key |
| 401 after changing callback settings | A new production API key was created; update the secret |
| 401 only behind a proxy | The proxy strips or rewrites `Authorization` |
| No callbacks at all | The key used for the generation has no callback URL set |
| 400 after authentication | Body isn't a JSON object |
