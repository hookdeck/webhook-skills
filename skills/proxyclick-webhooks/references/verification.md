# How to Authenticate Proxyclick (Eptura Visitor) Webhooks

## How It Works

Proxyclick **does not sign payloads**: there is no HMAC, timestamp or signature header. The only
security option is HTTP Basic authentication. You enter a username and password on the webhook,
and Proxyclick sends:

```
Authorization: Basic base64(username:password)
```

Points that cause most failures:

- **Credentials must arrive on the first request.** The docs don't say whether Basic credentials
  are sent preemptively. A `401` + `WWW-Authenticate` challenge flow won't work, and it won't
  work through Hookdeck, which verifies the request as received.
- The scheme is case-insensitive (`Basic`, `basic`). Split the decoded value on the **first**
  colon, because the password can contain colons.
- Compare the username **and** the password, each in constant time, and evaluate both before
  deciding, so a wrong username isn't distinguishable from a wrong password by timing.
- A missing or malformed header, or any mismatch, is a `401`. Never accept when the environment
  variables are unset.

## What Basic Auth Does Not Give You

A static shared credential authenticates the **sender, not the body**: anyone holding it can send
any payload, and nothing ties a request to its contents. There is no signature and no timestamp,
so there is **no replay protection**: a captured request can be replayed unchanged. Mitigations:

- Use an HTTPS destination URL. Proxyclick also allows plain HTTP, which exposes the credential.
- Rotate the credential if it leaks (change it on the webhook and in your environment).
- Make handlers idempotent so a replay is harmless.

## Implementation

There is no SDK. Verification is a Basic header parse plus two constant-time comparisons. Hashing
both sides first (Node) gives equal-length buffers, because `timingSafeEqual` throws on a length
mismatch.

### Node.js (Express)

```javascript
const crypto = require('crypto');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

function parseBasicAuth(header) {
  const m = /^basic +([A-Za-z0-9+/]+={0,2}) *$/i.exec(header || '');
  if (!m) return null;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  return i < 0 ? null : { username: decoded.slice(0, i), password: decoded.slice(i + 1) };
}

app.post('/webhooks/proxyclick', express.raw({ type: '*/*' }), (req, res) => {
  const creds = parseBasicAuth(req.headers['authorization']);
  const user = process.env.PROXYCLICK_WEBHOOK_USERNAME;
  const pass = process.env.PROXYCLICK_WEBHOOK_PASSWORD;
  if (!creds || !user || !pass) return res.status(401).end();
  const userOk = safeEqual(creds.username, user);
  const passOk = safeEqual(creds.password, pass);
  if (!(userOk && passOk)) return res.status(401).end();
  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8')); // parse only after the check
  } catch {
    return res.status(400).end();
  }
  // ...
});
```

### Next.js (App Router)

```typescript
const creds = parseBasicAuth(request.headers.get('authorization')); // same parser as above
// compare creds.username / creds.password with safeEqual, then: await request.text()
```

### Python (FastAPI)

```python
import base64, binascii, hmac

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def parse_basic_auth(header):
    scheme, _, encoded = (header or "").partition(" ")
    if scheme.lower() != "basic":
        return None
    try:
        encoded = encoded.strip()
        encoded += "=" * (-len(encoded) % 4)  # accept unpadded base64, like the Node examples
        decoded = base64.b64decode(encoded, validate=True).decode("utf-8")
    except (binascii.Error, ValueError):
        return None
    user, sep, password = decoded.partition(":")  # first colon
    return (user, password) if sep else None
```

## Debugging Verification Failures

- **401 on every request:** check `PROXYCLICK_WEBHOOK_USERNAME` and `PROXYCLICK_WEBHOOK_PASSWORD`
  match what you entered on the webhook, and that the webhook has credentials set at all.
- **Works with curl, fails from Proxyclick:** your server may be issuing a `401` challenge first
  and expecting a retry. Accept the header on the first request instead.
- **Fails only with special characters in the password:** make sure you split on the first colon
  and decode as UTF-8.
- **Body parse errors:** parse JSON only after the credential check, from the raw body.
