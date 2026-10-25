# How to Verify SAP Emarsys Webhook Requests

## How Does Emarsys Authenticate Webhook Node Calls?

Emarsys does not sign payloads. With HTTP basic authentication in the Webhook node preset, each
request carries:

```
Authorization: Basic base64(username:password)
```

There is no HMAC, timestamp or signature header, and the body is not part of the check.
Authenticate before parsing it.

**A static shared credential authenticates the sender, not the body, and gives no replay
protection** (no signature, no timestamp). Use HTTPS, and rotate the credential if it leaks.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

const sha256 = (v) => crypto.createHash('sha256').update(v).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha256(a), sha256(b));

function parseBasicAuth(header) {
  const m = typeof header === 'string' && /^basic +([A-Za-z0-9+/]+={0,2})$/i.exec(header);
  if (!m || m[1].length % 4 !== 0) return null;
  const raw = Buffer.from(m[1], 'base64');
  if (raw.toString('base64') !== m[1]) return null;
  const i = raw.indexOf(0x3a);
  return i < 0 ? null : { user: raw.subarray(0, i), pass: raw.subarray(i + 1) };
}
// verify: both safeEqual calls are evaluated before combining the results.
```

Alternatively check that the two Buffers have equal length, then call `crypto.timingSafeEqual`
on them directly; hashing both sides first avoids leaking the length.

### Python

```python
import base64, binascii, hmac, re

BASIC = re.compile(r"basic +([A-Za-z0-9+/]+={0,2})", re.I)

def parse_basic_auth(header):
    m = BASIC.fullmatch(header or "")
    if not m:
        return None
    try:
        raw = base64.b64decode(m.group(1), validate=True)   # strict: junk is rejected
    except (binascii.Error, ValueError):
        return None
    if base64.b64encode(raw).decode() != m.group(1):       # older Pythons ignore stray padding
        return None
    user, sep, password = raw.partition(b":")                 # first colon
    return (user, password) if sep else None

def verify(headers, username, password):
    creds = parse_basic_auth(headers.get("authorization"))
    if not (username and password and creds):
        return False
    user_ok = hmac.compare_digest(creds[0], username.encode("utf-8"))   # bytes, never str
    pass_ok = hmac.compare_digest(creds[1], password.encode("utf-8"))
    return user_ok and pass_ok
```

## Common Gotchas

- **Hookdeck never sends a 401 challenge.** The credentials must arrive with each request. If
  deliveries show as failed verification in Hookdeck, they are not arriving. Check that HTTP
  basic authentication is selected in the preset.
- **Preemptive sending is undocumented.** Emarsys's docs don't say whether the credentials are
  sent without a challenge, so never depend on a `WWW-Authenticate` round trip.
- **Split on the first colon.** The password may contain colons; the username cannot.
- **Decode strictly.** Accept only the base64 alphabet with canonical padding so valid
  credentials followed by junk are rejected (`validate=True` in Python).
- **Compare bytes in constant time.** Node: equal-length Buffers (or SHA-256 digests) with
  `crypto.timingSafeEqual`, which throws on unequal lengths. Python: `hmac.compare_digest` on
  bytes; a `str` argument raises on non-ASCII.
- **Don't short-circuit.** Evaluate the username and password comparisons both, then combine.
- **Fail closed.** If either environment variable is unset, reject everything.
- **JWT and OAuth2 are not covered.** The preset offers them, but Hookdeck's source and these
  examples verify HTTP basic only.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted,
  then `JSON.parse` after the check.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Env vars unset, or the preset uses a different username/password |
| 401 and no `Authorization` header in logs | The preset isn't using HTTP basic authentication, or a proxy strips the header |
| 401 for passwords with `:` | Splitting on the last colon instead of the first |
| 401 for non-ASCII credentials | Mixed encodings; compare as UTF-8 bytes |
| Hookdeck shows failed verification | Credentials aren't arriving with each request; see the gotcha above |
| Contact discarded | Your endpoint returned `406` |
| Program in Fail-safe mode | Eleven consecutive failures; fix the endpoint or return `406` for bad bodies |
