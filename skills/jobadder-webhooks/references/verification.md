# How to Authenticate JobAdder Webhooks

## How It Works

JobAdder **does not sign payloads**: there is no HMAC, timestamp or signature header. The only
credential is the optional `authorization` string set on the webhook, which JobAdder sends as the
`Authorization` header:

```
Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=
```

Points that cause most failures:

- The key is the **whole header value**, including any `Basic ` or `Bearer ` prefix. Compare the full
  header to `JOBADDER_AUTHORIZATION`. Don't strip the prefix, parse it, or base64-decode it, even
  when it looks like Basic credentials.
- If you didn't set `authorization` on the webhook, JobAdder sends no such header and there is
  nothing to verify. Set one.

**A static shared credential authenticates the sender, not the body, and gives no replay
protection** (no signature, no timestamp). Anyone who captures one request can replay it or send
a different body with the same header. Use HTTPS, treat the value like a password, rotate it
(`PUT /webhooks/{webhookId}`) if it leaks, and dedupe on `eventId`.

## Implementation

There is no SDK. Verification is a constant-time string comparison. Hash both sides first so the
buffers are equal length: `timingSafeEqual` throws on a length mismatch otherwise.

### Node.js (Express)

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

app.post('/webhooks/jobadder', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.JOBADDER_AUTHORIZATION;
  const received = req.headers['authorization'];
  if (!expected || !received || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  const payload = JSON.parse(req.body.toString('utf8'));
  // switch (payload.event) { ... }
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get('authorization'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.JOBADDER_AUTHORIZATION!)
```

### Python (FastAPI)

```python
import hashlib, hmac

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

# headers.get("authorization") vs os.environ["JOBADDER_AUTHORIZATION"]
```

Hashing first also means non-ASCII header values never raise (`compare_digest` on `str` does).

## Common Gotchas

- **Prefix handling**: store `Basic ...` / `Bearer ...` exactly as set on the webhook.
- **Unconfigured secret**: reject everything if `JOBADDER_AUTHORIZATION` is empty, otherwise an
  empty header would "match".
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before parsing;
  `express.raw({ type: '*/*' })` accepts any content type.
- **Duplicates and ordering**: the docs say order isn't guaranteed and duplicates can occur.
  Dedupe on `eventId`.
- **Hookdeck**: a Hookdeck JobAdder source (`JOBADDER`) checks the same header, whole value.

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present, then compare the length of the received value with the
   configured one (a missing `Basic `/`Bearer ` prefix shows as a 6- or 7-character difference).
3. Check for trailing whitespace or quotes in `.env`.
4. Confirm the webhook was created with an `authorization` value (`GET /webhooks` doesn't echo it;
   update the webhook with `PUT` to set a known value).
