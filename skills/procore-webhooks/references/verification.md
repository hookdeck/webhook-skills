# How to Authenticate Procore Webhooks

## How It Works

Procore **does not sign payloads**: there is no HMAC, signature header or timestamp. The only
credential is the optional **Authorization Header** field on the hook, whose value Procore
places verbatim in the `Authorization` header of the POST:

```
Authorization: Basic c3a24b8208ac5199d083d54a1234e94b8864
```

Points that cause most failures:

- The key is the **whole header value including any scheme prefix** (`Bearer `, `Basic `).
  Compare the full header to `PROCORE_AUTHORIZATION`; don't strip, add or parse the prefix.
- Never base64-decode it. The docs' example is a token, not base64 `user:pass`.
- Hookdeck's Procore source compares the same whole value. Paste the Authorization Header value
  exactly as set in Procore, including any "Bearer " or "Basic " prefix.

## What This Does Not Protect Against

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp). Anyone who captures one request can resend it or forge
new bodies. Use HTTPS, treat the credential like a password, make handlers idempotent, and
rotate the credential in Procore and in your environment if it leaks.

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

app.post('/webhooks/procore', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.PROCORE_AUTHORIZATION;
  const received = req.headers['authorization'];
  if (!expected || !received || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  const payload = JSON.parse(req.body.toString('utf8'));
  // ...
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get('authorization'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.PROCORE_AUTHORIZATION!)
```

### Python (FastAPI)

```python
import hashlib, hmac

def safe_equal(a: str, b: str) -> bool:
    # compare_digest on bytes; passing str raises TypeError on non-ASCII input
    return hmac.compare_digest(
        hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest()
    )

# headers.get("authorization") vs os.environ["PROCORE_AUTHORIZATION"]
```

## Common Gotchas

- **Prefix handling**: the stored secret must include `Basic ` / `Bearer ` exactly as entered in
  Procore. A prefix-less value never matches.
- **No decoding**: don't base64-decode the value or split it into user and password.
- **Unconfigured secret**: reject everything if `PROCORE_AUTHORIZATION` is empty, otherwise an
  empty header would "match".
- **Optional field**: the Authorization Header is optional in Procore. If it is blank on the
  hook, no `Authorization` header is sent and every request is rejected here. Set it.
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before
  parsing; `express.raw({ type: '*/*' })` accepts any content type.

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present, then compare the length of the received value with the
   configured one (a missing `Basic ` prefix shows up as a 6-character difference).
3. Check for trailing whitespace or quotes in `.env`.
4. Confirm the value matches the hook that is sending (company vs project hooks can differ).
