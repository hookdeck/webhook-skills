# How to Authenticate 360dialog Webhooks

## How It Works

360dialog **does not sign webhooks**: there is no HMAC, timestamp or signature header. The only
authentication is the header you set when you set the webhook URL:

```
Authorization: Basic base64(USER:PASS)
```

Points that cause most failures:

- Split the decoded value on the **first** colon; passwords may contain `:`.
- The scheme is case-insensitive (`Basic`, `basic`).
- The header is only sent if you put it in the `headers` object of the webhook configuration.

## What Basic Auth Does Not Give You

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection** (no signature, no timestamp). Anyone who learns the credential can forge requests,
and a captured request can be replayed. So:

- Use HTTPS only and treat the credential like a password.
- Rotate it if it leaks (set the webhook URL again with new headers).
- Make handlers idempotent on message and status IDs.

## Implementation

There is no SDK. Verification is decode, split, then two constant-time comparisons. Evaluate
both before deciding so timing doesn't reveal which part was wrong.

### Node.js (Express)

```javascript
const crypto = require('crypto');
const sha = (b) => crypto.createHash('sha256').update(b).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b)); // equal-length digests

app.post('/webhooks/360dialog', express.raw({ type: '*/*' }), (req, res) => {
  const { THREE_SIXTY_DIALOG_WEBHOOK_USERNAME: user, THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD: pass } = process.env;
  if (!user || !pass) return res.status(500).end(); // fail closed when unconfigured
  const m = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(req.headers['authorization'] || '');
  const decoded = m && Buffer.from(m[1], 'base64');
  const i = decoded ? decoded.indexOf(0x3a) : -1;
  if (i === -1) return res.status(401).end();
  const userOk = safeEqual(decoded.subarray(0, i), Buffer.from(user));
  const passOk = safeEqual(decoded.subarray(i + 1), Buffer.from(pass));
  if (!(userOk && passOk)) return res.status(401).end();
  const payload = JSON.parse(req.body.toString('utf8')); // parse only after the check
  // ...
});
```

If you compare raw buffers instead of digests, check lengths first: `crypto.timingSafeEqual`
throws on unequal lengths.

### Next.js (App Router)

```typescript
const header = request.headers.get('authorization'); // Headers is case-insensitive
// same regex + safeEqual as above, then: const payload = JSON.parse(await request.text());
```

See `lib/verify-360dialog.ts` in the Next.js example.

### Python (FastAPI)

```python
import base64, binascii, hashlib, hmac, re

def safe_equal(a: bytes, b: bytes) -> bool:
    # Bytes only: hmac.compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())

def verify(authorization, username, password) -> bool:
    m = re.match(r"^basic\s+([A-Za-z0-9+/]+={0,2})\s*$", authorization or "", re.I)
    if not m or not username or not password:
        return False
    try:
        user, sep, pw = base64.b64decode(m.group(1), validate=True).partition(b":")
    except (binascii.Error, ValueError):
        return False
    if not sep:
        return False
    user_ok = safe_equal(user, username.encode())
    pass_ok = safe_equal(pw, password.encode())
    return user_ok and pass_ok
```

## Common Gotchas

- **Raw body, any content type**: read raw bytes (`express.raw({ type: '*/*' })`,
  `request.text()`, `await request.body()`), authenticate, then parse JSON.
- **Status codes**: `401` for a missing, malformed or wrong credential; `400` for an invalid
  JSON body; `500` if the credential isn't configured on your server; `200` within 5 seconds.
- **Header names are lowercase** in Node (`req.headers['authorization']`).
- **Proxies**: some proxies and CDNs strip or rewrite `Authorization`. Check what reaches your app.
- **Credentials in the URL**: the 360dialog docs use the headers object, not
  `https://user:pass@host`. Put the credential in `headers`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always 401, header absent | Webhook was set without a `headers` object, or a proxy strips `Authorization` |
| 401 with correct USER/PASS | Password contains `:` and you split on the last colon, or you stored a different value than you encoded |
| 401 only for non-ASCII passwords | Compared `str` instead of bytes, or encoded the password in a different charset when creating the header |
| 500 | `THREE_SIXTY_DIALOG_WEBHOOK_USERNAME`/`PASSWORD` not set |
