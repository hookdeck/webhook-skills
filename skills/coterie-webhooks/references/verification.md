# How to Authenticate Coterie Webhooks

## How It Works

Coterie **does not sign payloads**: there is no HMAC, timestamp signature or signature
header. The only authentication is an opt-in static header:

```
Authentication: token {guid}
```

Points that cause most failures:

- The header is named `Authentication`, **not** `Authorization`.
- The key is the **whole header value including the `token ` prefix**. Compare the full
  header to `COTERIE_AUTHENTICATION` (for example `token 1234-...`); don't strip or add the prefix.
- It is sent only after your Coterie contact enables it.

Because the token is static, it only proves the sender knows the shared value. Use HTTPS and
treat the token like a password.

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

app.post('/webhooks/coterie', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.COTERIE_AUTHENTICATION;
  const received = req.headers['authentication'];
  if (!expected || !received || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  const payload = JSON.parse(req.body.toString('utf8'));
  // ...
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get('authentication'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.COTERIE_AUTHENTICATION!)
```

### Python (FastAPI)

```python
import hashlib, hmac

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest()
    )

# headers.get("authentication") vs os.environ["COTERIE_AUTHENTICATION"]
```

## Common Gotchas

- **Wrong header name**: `Authorization` is never sent. Read `Authentication`.
- **Missing prefix**: the stored secret must include `token `.
- **Unconfigured secret**: reject everything if `COTERIE_AUTHENTICATION` is empty, otherwise an
  empty header would "match".
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before parsing;
  `express.raw({ type: '*/*' })` accepts any content type.
- **Header disabled**: if requests arrive with no `Authentication` header, the optional header
  has not been enabled yet. Ask your Coterie contact; don't switch verification off.
- **Hookdeck**: a Hookdeck Coterie source verifies the same header (full value).

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authentication` is present, then compare the length of the received value with the
   configured one (a missing `token ` prefix shows up as a 6-character difference).
3. Check for trailing whitespace or quotes in `.env`.
4. Confirm the token matches the environment (test vs production) that is sending.
