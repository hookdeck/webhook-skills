# How to Verify Rebilly Webhook Requests

## How Does Rebilly Authenticate Webhooks?

When a webhook has HTTP basic access authentication credentials, Rebilly sends an authorization
header with the GET, POST, PUT, PATCH or DELETE request:

```
Authorization: Basic cmViaWxseTpzdXBlcm1hbgo=
```

That is `base64(username:password)`. Hookdeck's Rebilly source checks these credentials, and the examples do the same. There is no signature to compute for basic auth, and the body is not part
of the check.

**A static shared credential authenticates the sender, not the body, and gives no replay
protection** (basic auth itself carries no signature or timestamp). Use HTTPS, and rotate the credential if it leaks.
The credentials must arrive with each request (there is no `WWW-Authenticate` challenge round trip).

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

Hookdeck's Rebilly source and the example handlers check basic auth. For an additional check of
the original body, Rebilly recommends its organization-bound `v2a` signature.

The `webhook-signature` header contains space-separated Ed25519 signatures in any order.
Rebilly sends both `v2a` and legacy `v1a` and can send two of each during rotation. Verify
any `v2a` entry with the environment's `whpk_` public key from [Rebilly's signing documentation](https://www.rebilly.com/docs/dev-docs/webhooks-configuration).

```javascript
const { createHash, createPublicKey, verify } = require('node:crypto');

// Load the public key from trusted configuration once per environment.
function rebillyPublicKey(whpk) {
  const rawKey = Buffer.from(whpk.slice('whpk_'.length), 'base64');
  return createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: rawKey.toString('base64url') },
    format: 'jwk',
  });
}

function verifyV2a(headers, rawBody, publicKey, organizationId) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatures = headers['webhook-signature'];
  if (typeof id !== 'string' || !organizationId || !id.startsWith(organizationId + ':') ||
      typeof timestamp !== 'string' || !timestamp || typeof signatures !== 'string') return false;

  const endpointId = organizationId.replaceAll('%', '%25').replaceAll('.', '%2E');
  const digest = createHash('sha256')
    .update(`${endpointId}.${id}.${timestamp}.`)
    .update(rawBody)
    .digest();
  return signatures.split(' ').some(entry => {
    const match = /^v2a,([A-Za-z0-9+/]{86}==)$/.exec(entry); // Base64-encoded 64-byte signature
    return match !== null && verify(null, digest, publicKey, Buffer.from(match[1], 'base64'));
  });
}
```

Pass the raw body bytes and the organization ID you expect. For multiple organizations on one
URL, first check the organization prefix of `webhook-id` against your own list. The endpoint ID
is derived locally. Ed25519 verifies the raw 32-byte SHA-256 digest. Legacy `v1a` signs
`webhook-id.webhook-timestamp.raw-body` directly and requires a separate organization-prefix check.

Rebilly's direct-receiver example also checks that the delivery attempt is within five minutes
of receipt. Hookdeck forwards the original timestamp on replay, so a downstream verifier should
use it as signed text and deduplicate processed `webhook-id` values.

Rebilly also sends an RS256 JWT in `Security-Signature`. Its `aud` identifies the organization
and `requestBodyHash` authenticates the raw body. Rebilly publishes the environment's JSON Web
Keys at `/.well-known/keys` and recommends caching them for at most one hour.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Env vars unset, or the webhook has no basic auth credentials |
| GET/PUT/PATCH/DELETE deliveries never reach you | The method isn't allowed on the Hookdeck source |
| 401 for some passwords | Splitting on every colon instead of the first |
| 401 only behind a proxy | The proxy strips the `Authorization` header |
| Rebilly keeps retrying | The response wasn't exactly `200`, or took longer than 20 seconds |
| 400 after authentication | Body isn't a JSON object (check for a body template) |
