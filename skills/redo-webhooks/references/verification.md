# How to Authenticate Redo Webhooks

## How It Works

Redo **does not sign payloads**: there is no HMAC, no timestamp and no signature header. The
only authentication is a static Bearer secret you provide when creating the subscription:

```
Authorization: Bearer your-subscriber-secret
```

Points that cause most failures:

- The credential is the `Authorization` header. There is no other header to read.
- The key is the **whole header value including the `Bearer ` prefix**. Hookdeck's Redo source
  compares the full header, and so do the examples: set `REDO_AUTHORIZATION` to
  `Bearer your-subscriber-secret`. Don't strip, parse or base64-decode the prefix.
- Missing header or mismatch: respond `401`.

## What Does a Static Credential Protect?

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection** (no signature, no timestamp). Anyone who captures one valid request, or learns the
secret, can send arbitrary bodies or replay old ones. So:

- Use HTTPS only (Redo requires it).
- Keep the secret out of logs, URLs and source control.
- Rotate it if it leaks. The docs' `PATCH /v2.2/webhooks/{webhookId}` example changes only
  `topics` and doesn't say it accepts `secret`, so the documented route is to create a new
  subscription with a new `secret`, update `REDO_AUTHORIZATION` (and the Hookdeck source), then
  `DELETE` the old subscription.
- Make handlers idempotent (`return.id` + `at`).

## Implementation

There is no SDK. Verification is a constant-time comparison of the whole header value.

### Node.js (Express)

Check lengths and then `timingSafeEqual` on equal-length buffers; hashing both sides first
gives equal-length buffers for free.

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

app.post('/webhooks/redo', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.REDO_AUTHORIZATION;
  const received = req.headers['authorization'];
  if (!expected || !received || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  const event = JSON.parse(req.body.toString('utf8')); // parse only after the check
  // ...
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get('authorization'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.REDO_AUTHORIZATION!)
const event = JSON.parse(await request.text());         // after the check
```

### Python (FastAPI)

Encode both sides to bytes: `hmac.compare_digest` raises `TypeError` for a non-ASCII `str`.

```python
import hashlib, hmac

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

# headers.get("authorization") vs os.environ["REDO_AUTHORIZATION"]
```

## Common Gotchas

- **Missing prefix**: the stored secret must include `Bearer `. Storing only the secret fails.
- **Double prefix**: Hookdeck's note says paste `Bearer ` followed by the secret, not
  `Bearer Bearer ...`.
- **Unconfigured secret**: reject everything if `REDO_AUTHORIZATION` is empty, otherwise an empty
  header would "match".
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before parsing;
  `express.raw({ type: '*/*' })` accepts any content type.
- **Slow responses**: reply 2xx within 5 seconds and process asynchronously, or Redo retries.
- **Hookdeck**: a Hookdeck Redo source verifies the same header (full value).

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present, then compare the length of the received value with the
   configured one (a missing `Bearer ` prefix is a 7-character difference).
3. Check for trailing whitespace or quotes in `.env`.
4. Confirm the `secret` on the subscription matches (list it with `GET .../webhooks`).
