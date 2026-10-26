# How to Verify parcelLab Webhook Authentication

## How It Works

parcelLab does **not** sign webhooks. There is no signature header and no timestamp. It
authenticates with the credentials you give it, and for HTTP Basic that is:

```
Authorization: Basic base64(username:password)
```

Verification means: parse that header, split the decoded value on the **first** colon, and
compare the username and the password each in constant time. Evaluate both comparisons before
deciding (don't short-circuit), so timing doesn't reveal which half was wrong.

## What This Does and Doesn't Prove

A static shared credential authenticates the **sender**, not the **body**. With no signature
and no timestamp:

- a captured request can be replayed, so deduplicate on `eventid`
- the body can't be proven untampered, so use HTTPS only (parcelLab requires it)
- if the credential leaks, anyone can post events, so rotate it

## Credentials Must Arrive on the First Request

The docs don't say whether Basic credentials are sent preemptively. A `401` +
`WWW-Authenticate` challenge flow won't work, and it won't work through Hookdeck, which
verifies the request as received.

## Implementation

### Node.js (Express)

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb); // digests are equal length, never throws
}

function verifyParcellabRequest(headers, config = process.env) {
  const username = config.PARCELLAB_WEBHOOK_USERNAME;
  const password = config.PARCELLAB_WEBHOOK_PASSWORD;
  if (!username || !password) return false;

  const match = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(headers['authorization'] || '');
  if (!match) return false;
  const decoded = Buffer.from(match[1], 'base64');
  const colon = decoded.indexOf(0x3a);
  if (colon < 0) return false;

  const usernameOk = safeEqual(decoded.subarray(0, colon), Buffer.from(username));
  const passwordOk = safeEqual(decoded.subarray(colon + 1), Buffer.from(password));
  return usernameOk && passwordOk;
}

// Read raw so any content type works; parse JSON only after the check.
app.post('/webhooks/parcellab', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyParcellabRequest(req.headers)) return res.status(401).end();
  const payload = JSON.parse(req.body.toString('utf8'));
  // ...
});
```

### Python (FastAPI)

```python
import base64, binascii, hmac, os, re

BASIC_RE = re.compile(r"^basic\s+([A-Za-z0-9+/]+={0,2})\s*$", re.IGNORECASE)

def verify_parcellab_request(headers, config=os.environ) -> bool:
    username = config.get("PARCELLAB_WEBHOOK_USERNAME")
    password = config.get("PARCELLAB_WEBHOOK_PASSWORD")
    if not username or not password:
        return False
    match = BASIC_RE.match(headers.get("authorization") or "")
    if not match:
        return False
    try:
        decoded = base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError):
        return False
    user, sep, pw = decoded.partition(b":")  # first colon only
    if not sep:
        return False
    # bytes, not str: compare_digest raises TypeError on non-ASCII str
    user_ok = hmac.compare_digest(user, username.encode("utf-8"))
    pw_ok = hmac.compare_digest(pw, password.encode("utf-8"))
    return user_ok and pw_ok
```

### Next.js (App Router)

Same logic with `headers.get('authorization')`; see
[examples/nextjs/lib/verify-parcellab.ts](../examples/nextjs/lib/verify-parcellab.ts).
Read `await request.text()` only after the check passes.

## Common Gotchas

- **Split on the first colon.** Passwords may contain colons; usernames can't.
- **The scheme is case-insensitive.** Accept `Basic`, `basic` and `BASIC`.
- **Don't use `===` or `==`** on credentials. Use `crypto.timingSafeEqual` (equal-length
  buffers or SHA-256 digests) or `hmac.compare_digest` on bytes.
- **Encode both sides to bytes in Python.** Passing `str` to `compare_digest` raises on non-ASCII.
- **Never accept when unconfigured.** Empty env vars must fail closed.
- **Read the body raw.** `express.raw({ type: '*/*' })` accepts `application/json`,
  `application/cloudevents+json` or anything else.
- **Don't confuse the three auth modes.** An access token header or OAuth 2.0 token is a
  different configuration; this skill and Hookdeck's parcelLab source verify HTTP Basic.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `401` on every request | Env vars unset, or the credentials given to parcelLab differ from yours |
| `401` only with some passwords | Colon or non-ASCII characters mishandled (split on the first colon, compare bytes) |
| No `Authorization` header arrives | parcelLab is configured for token header or OAuth 2.0, not Basic |
| `400` after authentication | Body is not a JSON object |
| Events keep arriving | You returned a non-2xx: parcelLab retries 15 times at 30 minute intervals |
