# How to Verify Rebilly Webhook Requests

## How Does Rebilly Authenticate Webhooks?

When a webhook has HTTP basic access authentication credentials, Rebilly sends an authorization
header with the GET, POST, PUT, PATCH or DELETE request:

```
Authorization: Basic cmViaWxseTpzdXBlcm1hbgo=
```

That is `base64(username:password)`. Hookdeck's Rebilly source verifies exactly this header, and
the examples do the same. There is no signature to compute for basic auth, and the body is not part
of the check.

> Hookdeck shows this note for the source: "Set HTTP basic access authentication on the Rebilly webhook. Its JWT and Ed25519 signatures are not checked."

**A static shared credential authenticates the sender, not the body, and gives no replay
protection** (no signature, no timestamp). Use HTTPS, and rotate the credential if it leaks.
Hookdeck never sends a 401 challenge (no `WWW-Authenticate` round trip), so the credentials must
arrive with each request.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

const BASIC_RE = /^basic +([A-Za-z0-9+/]+={0,2})$/i;
const digest = (b) => crypto.createHash('sha256').update(b).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

function verifyRebillyRequest(headers, username, password) {
  if (!username || !password) return false;
  const m = BASIC_RE.exec(headers.authorization || '');
  if (!m || m[1].length % 4 !== 0) return false;
  const decoded = Buffer.from(m[1], 'base64');
  if (decoded.toString('base64') !== m[1]) return false;
  const colon = decoded.indexOf(0x3a);
  if (colon === -1) return false;
  const userOk = safeEqual(decoded.subarray(0, colon), Buffer.from(username));
  const passOk = safeEqual(decoded.subarray(colon + 1), Buffer.from(password));
  return userOk && passOk;
}
```

### Python

```python
import base64, binascii, hmac, re

BASIC_RE = re.compile(r"basic +([A-Za-z0-9+/]+={0,2})", re.IGNORECASE)

def verify_rebilly_request(headers, username: str, password: str) -> bool:
    if not username or not password:
        return False
    m = BASIC_RE.fullmatch(headers.get("authorization") or "")
    if not m:
        return False
    try:
        decoded = base64.b64decode(m.group(1), validate=True)
    except (binascii.Error, ValueError):
        return False
    user, sep, pw = decoded.partition(b":")
    if not sep:
        return False
    user_ok = hmac.compare_digest(user, username.encode())
    pass_ok = hmac.compare_digest(pw, password.encode())
    return user_ok and pass_ok
```

## Common Gotchas

- **Split on the first colon.** The username can't contain `:`, but the password can.
- **Strict base64.** Accept only the base64 alphabet and decode strictly (`validate=True` in Python),
  so valid credentials followed by junk are rejected. The scheme name is case-insensitive.
- **Compare each part in constant time and evaluate both.** Don't return early on a wrong username.
  In Node, hash both sides or check lengths before `timingSafeEqual`, which throws on unequal
  lengths. In Python, use `hmac.compare_digest` on `bytes`: passing `str` raises on non-ASCII.
- **Fail closed.** If the credentials are not configured, reject everything.
- **Check every method.** GET and DELETE webhooks have no body; authenticate them the same way and
  return `200` for an empty body.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, and
  parse it only after the credential check.
- **Return exactly 200.** Rebilly treats any other status (including 202 and 204) as a failure and retries.

## Optional: Rebilly's Own Signatures

Every Rebilly webhook is also signed, in two ways. Hookdeck's Rebilly source checks neither, and
the examples don't either.

1. **`Security-Signature`**: an RS256 JWT. Rebilly's docs describe it as a body-bound JWT verified against Rebilly's
   published public keys; confirm the claim names and key URLs in Rebilly's webhook docs before
   relying on it, as this skill doesn't implement it.
2. **Standard Webhooks `v1a`**: an Ed25519 signature in `webhook-id`, `webhook-timestamp` and
   `webhook-signature`. Rebilly's public keys are fixed per environment:
   - live: `whpk_lr2xkGO1EEdyZxVx4DKQ5XfmSjxOmwv9UcwNPbn9fFI=`
   - sandbox: `whpk_qism49rHt4dOh6txzL3dfnMTmhQiITY1A86Y9BJGEZM=`

To check `v1a` yourself: build the signed content `<webhook-id>.<webhook-timestamp>.<raw body>`,
take each space-separated `v1a,<base64>` entry of `webhook-signature`, and verify it with Ed25519
against the key from the `whpk_` value (strip the `whpk_` prefix and base64-decode to 32 bytes).
The `svix` and `standardwebhooks` libraries do not support `v1a`.

```javascript
const crypto = require('crypto');
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function verifyV1a(headers, rawBody, whpk) {
  const raw = Buffer.from(whpk.replace(/^whpk_/, ''), 'base64');
  const key = crypto.createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: 'der', type: 'spki',
  });
  const content = Buffer.from(`${headers['webhook-id']}.${headers['webhook-timestamp']}.${rawBody.toString('utf8')}`);
  return String(headers['webhook-signature'] || '').split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    return version === 'v1a' && crypto.verify(null, content, key, Buffer.from(sig || '', 'base64'));
  });
}
```

Do not add Rebilly's 5-minute `webhook-timestamp` check behind Hookdeck: retries resend the
original timestamp, so a freshness window would reject every retry. A signature adds body
integrity, but it is an extra; the basic auth check remains the one Hookdeck performs.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Env vars unset, or the webhook has no basic auth credentials |
| GET/PUT/PATCH/DELETE deliveries never reach you | The method isn't allowed on the Hookdeck source (it pre-selects POST) |
| 401 for some passwords | Splitting on every colon instead of the first |
| 401 only behind a proxy | The proxy strips the `Authorization` header |
| Rebilly keeps retrying | The response wasn't exactly `200`, or took longer than 20 seconds |
| 400 after authentication | Body isn't a JSON object (check for a body template) |
