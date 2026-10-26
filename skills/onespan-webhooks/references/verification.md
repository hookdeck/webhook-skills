# How to Authenticate OneSpan Sign Callbacks

## How It Works

OneSpan Sign **does not sign payloads**: there is no HMAC, signature header or timestamp. The
only authentication is the callback key you registered, passed through the `Authorization`
header:

```
Authorization: Basic {callbackKey}
```

Points that cause most failures:

- `{callbackKey}` is the **raw key**, NOT base64(user:pass). Don't decode it as HTTP Basic auth
  and don't use a framework's Basic-auth parser.
- The credential is the **whole header value including the `Basic ` prefix**. Compare the full
  `Authorization` header to `ONESPAN_AUTHORIZATION` (for example `Basic secureKey#1`); don't
  strip or add the prefix.
- It is sent only when the Authentication Method is Basic (or a key was set via `POST /api/callback`).

## What This Does and Doesn't Protect

A static shared credential authenticates the **sender**, not the body, and gives **no replay
protection**: there is no signature and no timestamp, so anyone who captures a request can
resend it, and the body can't be checked for tampering beyond what TLS gives you. Use HTTPS,
treat the key like a password, make handlers idempotent, and rotate the key (register a new
one) if it leaks.

## Implementation

There is no SDK for this check. It is a constant-time string comparison. Hash both sides first
so the buffers are equal length: `timingSafeEqual` throws on a length mismatch otherwise.

### Node.js (Express)

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

app.post('/webhooks/onespan', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.ONESPAN_AUTHORIZATION;
  const received = req.headers['authorization'];
  if (!expected || !received || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  const payload = JSON.parse(req.body.toString('utf8')); // parse only after the check
  // switch (payload.name) { ... }
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get('authorization'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.ONESPAN_AUTHORIZATION!), then await request.text()
```

### Python (FastAPI)

```python
import hashlib, hmac

def safe_equal(a: str, b: str) -> bool:
    # compare_digest on bytes: str operands raise TypeError on non-ASCII
    return hmac.compare_digest(
        hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest()
    )

# headers.get("authorization") vs os.environ["ONESPAN_AUTHORIZATION"]
```

## Common Gotchas

- **Decoding as Basic auth**: the value after `Basic ` is not base64 of `user:pass`. Comparing
  against a decoded username/password will always fail.
- **Missing prefix**: the stored secret must include `Basic `.
- **Unconfigured secret**: reject everything if `ONESPAN_AUTHORIZATION` is empty, otherwise an
  empty header would "match".
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before parsing;
  `express.raw({ type: '*/*' })` accepts any content type.
- **Authentication Method None**: no header is sent, so there is nothing to verify. Switch to
  Basic and set a callback key.
- **Timeouts**: respond `2xx` within the callback timeout (20 seconds in the docs) and do slow
  work, such as downloading signed documents, asynchronously.
- **Hookdeck**: a Hookdeck OneSpan source verifies the same header (full value).

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present, then compare the length of the received value with the
   configured one (a missing `Basic ` prefix shows up as a 6-character difference).
3. Check for trailing whitespace or quotes in `.env`.
4. Confirm the key matches the environment (sandbox vs production) that is sending, and that
   the Authentication Method is Basic.
