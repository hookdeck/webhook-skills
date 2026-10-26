# How to Authenticate Zoop Webhooks

## How It Works

Zoop **does not sign payloads**: there is no HMAC, timestamp or signature header. The partner
creates the webhook with an `authorization` string, and Zoop returns it in the request header:

```
Authorization: xxxxxxxxxxxx
```

Points that cause most failures:

- The header is `Authorization`. There is no `Bearer` prefix unless you put one in the string.
- Compare the **whole header value** with `ZOOP_AUTHORIZATION` (the exact string set when the
  webhook was created). Don't strip, parse or base64-decode a prefix.
- Hookdeck's Zoop source does the same: it compares the whole `Authorization` header with the
  configured value.

## What Does This Protect Against?

A static shared credential authenticates **the sender, not the body**. There is no signature and
no timestamp, so it gives **no replay protection**, and it cannot show that the payload was not
modified in transit. So:

- Accept webhooks over HTTPS only.
- Treat the value like a password: keep it out of source control and logs.
- Rotate it if it leaks: create the webhook again with a new `authorization` and update
  `ZOOP_AUTHORIZATION`.
- Dedupe on the event `id` so a replayed request does no extra work.

## Implementation

There is no SDK. Verification is a constant-time string comparison. Hash both sides first so
the buffers are equal length: `timingSafeEqual` throws on a length mismatch otherwise.

### Node.js (Express)

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

app.post('/webhooks/zoop', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.ZOOP_AUTHORIZATION;
  const received = req.headers['authorization'];
  if (!expected || !received || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  res.status(200).end(); // acknowledge within 1 second, then process
  const event = JSON.parse(req.body.toString('utf8'));
  // ...
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get('authorization'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.ZOOP_AUTHORIZATION!)
```

### Python (FastAPI)

```python
import hashlib, hmac

def safe_equal(a: str, b: str) -> bool:
    # compare_digest needs bytes (or ASCII-only str); encode both sides.
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )

# headers.get("authorization") vs os.environ["ZOOP_AUTHORIZATION"]
```

## Common Gotchas

- **Unconfigured secret**: reject everything if `ZOOP_AUTHORIZATION` is empty, otherwise an
  empty header would "match".
- **Value mismatch**: the value is exactly what you passed as `authorization` when creating the
  webhook, including any scheme prefix you added.
- **The ping**: Zoop's docs don't say whether it carries the `Authorization` header. The
  examples check it, so a wrong or missing value makes the ping fail and the webhook stays
  `registred`; confirm on a real ping.
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before parsing;
  `express.raw({ type: '*/*' })` accepts any content type.
- **1-second timeout**: verify, return `200`, then process.

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present and compare its length with the configured value.
3. Check for trailing whitespace or quotes in `.env`.
4. Confirm you are comparing against the value of the webhook that is sending (list the
   marketplace webhooks to see which are registered).
