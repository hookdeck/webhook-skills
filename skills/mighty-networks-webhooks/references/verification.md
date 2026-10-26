# How to Verify Mighty Networks Webhook Requests

## Does Mighty Networks Sign Webhooks?

No. There is no HMAC signature and no timestamp header. You configure an API key with the webhook,
and Mighty Networks sends it on every request:

```
Authorization: Bearer YOUR_CONFIGURED_API_KEY
```

The docs say to "always validate the `Authorization` header matches your configured key".

## What This Check Does and Doesn't Give You

A static shared credential authenticates the **sender**, not the **body**. The body isn't covered
by anything, so a request that carries the right key could have been altered by whoever holds it.
It also gives **no replay protection**: with no signature and no timestamp, a captured request can
be sent again and will pass. So:

- Serve the endpoint over **HTTPS** only (the docs require it in production).
- **Rotate the key** in Mighty Networks and in `MIGHTY_NETWORKS_WEBHOOK_SECRET` if it leaks.
- **Dedupe on `event_id`** so retries and replays don't run twice.

## Implementation

Store only the bare key. The check:

1. Fails closed if no key is configured.
2. Requires the `Authorization` header to start with `Bearer ` (scheme compared case-insensitively,
   RFC 9110).
3. Compares the rest, exactly as sent, with the key in constant time.

If the configured value itself starts with `Bearer ` (any case), strip that prefix first, as
Hookdeck does. Never trim or otherwise alter the key.

### Node.js

```javascript
const crypto = require('crypto');

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest();
const hasBearer = (v) => typeof v === 'string' && /^bearer /i.test(v);

function verifyMightyNetworksRequest(headers, secret = process.env.MIGHTY_NETWORKS_WEBHOOK_SECRET) {
  if (!secret) return false;
  const expected = hasBearer(secret) ? secret.slice(7) : secret;
  if (!expected) return false; // a configured value of just "Bearer " must not match
  const auth = headers['authorization'];
  if (!expected || !hasBearer(auth)) return false;
  return crypto.timingSafeEqual(sha256(auth.slice(7)), sha256(expected));
}
```

### Python

```python
import hashlib, hmac, os

def has_bearer(v) -> bool:
    return isinstance(v, str) and v[:7].lower() == "bearer "

def verify_mighty_networks_request(headers, secret=None) -> bool:
    secret = secret if secret is not None else os.environ.get("MIGHTY_NETWORKS_WEBHOOK_SECRET")
    if not secret:
        return False
    expected = secret[7:] if has_bearer(secret) else secret
    if not expected:
        return False  # a configured value of just "Bearer " must not match
    auth = headers.get("authorization")
    if not expected or not has_bearer(auth):
        return False
    # Compare bytes: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(auth[7:].encode("utf-8"), expected.encode("utf-8"))
```

## Common Gotchas

- **Store the bare key**, not `Bearer <key>`. The check adds the scheme itself.
- **Scheme case.** `Bearer`, `bearer` and `BEARER` are all valid. Compare the scheme
  case-insensitively and the key case-sensitively.
- **Constant-time compare.** Plain `===` / `==` leaks timing. Hash both sides (or check lengths)
  before `timingSafeEqual`, which throws on unequal lengths. In Python, compare **bytes**.
- **Fail closed.** If `MIGHTY_NETWORKS_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, and
  `JSON.parse` only after the check.
- **`event_type` has a `Hook` suffix.** Strip it before matching `MemberJoined` etc.
- **Respond fast.** Any 2xx within 10 seconds. Failures are retried up to 5 times and repeated
  failures trip a circuit breaker.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `MIGHTY_NETWORKS_WEBHOOK_SECRET` unset, or differs from the key configured in Mighty Networks |
| 401 and the key looks right | A trailing newline or space was added when storing it; the key must match exactly |
| 401 only behind a proxy | The proxy strips or rewrites `Authorization` |
| 401 after rotating the key | One side still has the old key |
| 400 after authentication | Body isn't a JSON object |
| Event logged as unhandled | `event_type` wasn't normalised (`PostCreatedHook` vs `PostCreated`) |
