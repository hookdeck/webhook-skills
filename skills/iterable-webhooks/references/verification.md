# How to Authenticate Iterable Webhooks

## How It Works

Iterable **does not sign payloads**: there is no HMAC, signature header or timestamp. The
only authentication is the `Authorization` header, sent when the webhook uses Basic or
OAuth 2.0:

```
Authorization: Bearer <token>        (OAuth 2.0: you enter only the token)
Authorization: Basic abc123          (Basic: exactly what you typed in Authentication Token)
```

Points that cause most failures:

- The **Basic** value is whatever you typed, not necessarily base64 `user:pass`. Never decode it.
- The **whole header value** is the credential, scheme prefix included. Compare the full
  `Authorization` header to `ITERABLE_AUTHORIZATION`; don't strip or add the prefix.
- With Authentication set to None, no `Authorization` header is sent at all.

## Security Limits

A static shared credential **authenticates the sender, not the body**, and gives **no replay
protection** (no signature, no timestamp): anyone who captures a request can resend or alter
it with the same header. Use HTTPS (Iterable requires it), keep the credential secret, and
rotate it if it leaks. Deduplicate events in your handler.

## Implementation

There is no SDK. Verification is a constant-time string comparison. Hash both sides so the
buffers are equal length: `timingSafeEqual` throws on a length mismatch otherwise (or check
lengths first and return false).

### Node.js (Express)

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

app.post('/webhooks/iterable', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.ITERABLE_AUTHORIZATION;
  const received = req.headers['authorization'];
  if (!expected || !received || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  const payload = JSON.parse(req.body.toString('utf8'));
  // switch (payload.eventName) { ... }
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get('authorization'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.ITERABLE_AUTHORIZATION!)
```

### Python (FastAPI)

```python
import hashlib, hmac

def safe_equal(a: str, b: str) -> bool:
    # compare_digest on bytes: str with non-ASCII characters raises TypeError
    return hmac.compare_digest(
        hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest()
    )

# headers.get("authorization") vs os.environ["ITERABLE_AUTHORIZATION"]
```

## Common Gotchas

- **Decoding Basic**: don't. Compare the string as sent.
- **Missing prefix**: the stored secret must include `Bearer ` or `Basic `.
- **Unconfigured secret**: reject everything if `ITERABLE_AUTHORIZATION` is empty, otherwise an
  empty header would "match".
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before parsing;
  `express.raw({ type: '*/*' })` accepts any content type.
- **No retry on 401**: Iterable retries only `429`, `502`, `503` and `504`. Events that hit a
  `401` or `500` are dropped, so don't use auth failures to shed load.
- **Authentication None**: if requests arrive without `Authorization`, the webhook is set to
  None. Switch it to Basic or OAuth 2.0 rather than turning verification off.
- **Hookdeck**: a Hookdeck Iterable source compares the same header (full value).

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present, then compare the length of the received value with the
   configured one (a missing `Bearer ` prefix shows up as a 7-character difference).
3. Check for trailing whitespace or quotes in `.env`.
4. Confirm the credential matches the Iterable project and webhook that is sending (tokens are
   hidden after saving, so re-enter it if unsure).
