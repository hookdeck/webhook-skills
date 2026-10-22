# How to Authenticate Rev AI Webhooks

## How It Works

Rev AI **does not sign payloads**: there is no HMAC, timestamp or signature header. The only
authentication is the static `Authorization` header you pass in
`notification_config.auth_headers` when you submit the job:

```
Authorization: <scheme> <token>      e.g.  Authorization: Bearer 3f9c...
```

Points that cause most failures:

- The header is `Authorization`, and its value must be of the form `<scheme> <token>`.
- The key is the **whole header value including the scheme prefix**. Compare the full header
  to `REV_AI_AUTHORIZATION` (for example `Bearer 3f9c...`); don't strip, parse or add the prefix.
  This is also how Hookdeck's Rev.ai source compares it.
- A callback submitted with the deprecated `callback_url` carries no header at all.

## What This Does and Does Not Protect

A static shared credential authenticates the **sender**, not the **body**, and gives **no
replay protection** (no signature, no timestamp). Anyone who captures one request can replay it
or reuse the credential with a different body. So:

- Use HTTPS only.
- Treat the credential like a password and rotate it if it leaks.
- Deduplicate on `job.id` plus `job.status`, and re-fetch the job or transcript from the Rev AI
  API (authenticated with your access token) instead of trusting webhook contents for anything
  sensitive.

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

app.post('/webhooks/rev-ai', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.REV_AI_AUTHORIZATION;
  const received = req.headers['authorization'];
  if (!expected || !received || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  const { job } = JSON.parse(req.body.toString('utf8'));
  // job.status is 'transcribed' or 'failed'
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get('authorization'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.REV_AI_AUTHORIZATION!)
```

### Python (FastAPI)

```python
import hashlib, hmac

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(
        hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest()
    )

# headers.get("authorization") vs os.environ["REV_AI_AUTHORIZATION"]
```

(`hmac.compare_digest(a.encode(), b.encode())` also works; never pass `str` directly.)

## Common Gotchas

- **Missing prefix**: the stored secret must include the scheme (`Bearer `), exactly as you sent
  it in `auth_headers`.
- **Unconfigured secret**: reject everything if `REV_AI_AUTHORIZATION` is empty, otherwise an
  empty header would "match".
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before parsing;
  `express.raw({ type: '*/*' })` accepts any content type.
- **Non-200 responses retry**: a `401` makes Rev AI retry every 30 minutes for 24 hours, so fix
  the credential rather than ignoring the failures.
- **Different credential per job**: the header is set per job, so jobs submitted with different
  values will each need to match what you configured.

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present. If not, the job was probably submitted with `callback_url`
   or without `auth_headers`.
3. Compare the length of the received value with the configured one (a missing `Bearer `
   prefix shows up as a 7-character difference).
4. Check for trailing whitespace or quotes in `.env`.
5. Confirm the job was submitted with the same value you configured.
