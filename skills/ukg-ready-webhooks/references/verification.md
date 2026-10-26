# How to Authenticate UKG Ready Webhooks

## How It Works

UKG Ready (Ready only, not UKG Pro) **does not sign payloads**: there is no HMAC, signature
header or timestamp. The subscription's Authentication option is Basic, OAuth, Bearer Token or
No Authentication, and the credential is the `Authorization` header. With Bearer Token, UKG
Ready's docs say only that the token goes in the request header; the expected form is:

```
Authorization: Bearer <token>
```

If deliveries are rejected, capture one (for example with `npx hookdeck-cli listen`) and set
`UKG_READY_AUTHORIZATION` to the `Authorization` value exactly as received.

**A static shared credential authenticates the sender, not the body, and gives no replay
protection** (no signature, no timestamp). Anyone who captures the header can resend it, and the
body can't be checked against it. Use HTTPS, make handlers idempotent, and rotate the credential
if it leaks.

Points that cause most failures:

- Hookdeck's UKG Ready source compares the **whole** `Authorization` value to the configured
  key, so `UKG_READY_AUTHORIZATION` is the full value, e.g. `Bearer <token>`. Don't strip,
  parse or base64-decode the prefix.
- Choose **Bearer Token** on the subscription, not Basic. Basic and OAuth are not covered by
  Hookdeck's UKG Ready source.

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

app.post('/webhooks/ukg-ready', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.UKG_READY_AUTHORIZATION;
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
// compare with safeEqual(received, process.env.UKG_READY_AUTHORIZATION!)
```

### Python (FastAPI)

```python
import hmac

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

# headers.get("authorization") vs os.environ["UKG_READY_AUTHORIZATION"]
```

## Common Gotchas

- **Missing prefix**: the stored secret must include the prefix (expected to be `Bearer `).
- **Basic selected**: UKG Ready would send `Authorization: Basic ...`, which won't match.
- **Unconfigured secret**: reject everything if `UKG_READY_AUTHORIZATION` is empty, otherwise
  an empty header would "match".
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before
  parsing; `express.raw({ type: '*/*' })` accepts any content type.
- **No Authentication**: never use it in production; anyone could post to your endpoint.

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present and compare its length with the configured value. It is
   expected to start with `Bearer `; if it doesn't, capture a delivery and set
   `UKG_READY_AUTHORIZATION` to the value exactly as received.
3. Check for trailing whitespace or quotes in `.env`.
4. Check the Webhook Events Log in UKG Ready for the failure, then use **Retry Failed Events**.
