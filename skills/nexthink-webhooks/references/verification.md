# How to Authenticate Nexthink Webhooks

## How It Works

Nexthink webhooks **are not signed**: there is no HMAC, timestamp or signature header. The
credential is the `Authorization` header built from the Bearer token connector credential:

```
Authorization: <Header prefix> <Token>      e.g. Authorization: Bearer abc123
```

Points that cause most failures:

- The key is the **whole `Authorization` value including the scheme prefix**. Compare the
  full header to `NEXTHINK_AUTHORIZATION` (for example `Bearer abc123`); don't strip, parse or
  base64-decode the prefix.
- The prefix is whatever you typed in the credential's **Header prefix** field (usually
  `Bearer`). Nexthink's `CwsAuth bearer=` example and the "Add a space between prefix and value"
  option are documented for OAuth credentials only, so with any other prefix, capture a test
  request and copy the exact header value.
- Only the Bearer token type is covered; Basic and OAuth credentials are not.

## A Static Credential Is Limited

A static shared credential authenticates the **sender, not the body**, and gives **no replay
protection** (no signature, no timestamp). Anyone who captures one request can resend it or
alter the body. Use HTTPS only, treat the token like a password, and rotate the connector
credential if it leaks.

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

// The method is the webhook's choice: allow POST, PUT and PATCH.
function handler(req, res) {
  const expected = process.env.NEXTHINK_AUTHORIZATION;
  const received = req.headers['authorization'];
  if (!expected || !received || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  // req.body is a Buffer (possibly empty): parse only now
}
app.route('/webhooks/nexthink')
  .post(express.raw({ type: '*/*' }), handler)
  .put(express.raw({ type: '*/*' }), handler)
  .patch(express.raw({ type: '*/*' }), handler);
```

### Next.js (App Router)

```typescript
// Export POST, PUT and PATCH from app/webhooks/nexthink/route.ts
const received = request.headers.get('authorization'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.NEXTHINK_AUTHORIZATION!)
```

### Python (FastAPI)

```python
import hmac

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

# headers.get("authorization") vs os.environ["NEXTHINK_AUTHORIZATION"]
```

## Common Gotchas

- **Missing prefix**: the stored secret must include `Bearer ` (or your custom prefix).
- **Unconfigured secret**: reject everything if `NEXTHINK_AUTHORIZATION` is empty, otherwise an
  empty header would "match".
- **Methods**: the webhook uses POST, PUT or PATCH. A POST-only route returns 404/405 for the
  others.
- **Empty body**: the Payload may be empty or minimal; don't fail on a missing body.
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before parsing;
  `express.raw({ type: '*/*' })` accepts any content type.
- **Hookdeck**: a Hookdeck Nexthink source compares the same header (full value) and
  pre-selects POST; allow PUT/PATCH on the source if you use them.

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present, then compare the length of the received value with the
   configured one (a missing `Bearer ` prefix shows as a 7-character difference).
3. Check for trailing whitespace or quotes in `.env`.
4. Confirm the webhook uses a **Bearer token** credential and the Header prefix matches.
