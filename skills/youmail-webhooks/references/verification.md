# How to Authenticate YouMail Webhooks

## How It Works

YouMail **does not sign payloads**: there is no HMAC, timestamp or signature header. The only
authentication is the optional `auth` scheme configured on the webhook. YouMail's docs say the
`Bearer` scheme "requires additional `token`" but don't print the header it produces; the
expected form is:

```
Authorization: Bearer <token>
```

If deliveries are rejected, capture one (for example with `npx hookdeck-cli listen`) and set
`YOUMAIL_AUTHORIZATION` to the `Authorization` value exactly as received.

A **static shared credential authenticates the sender, not the body, and gives no replay
protection** (no signature, no timestamp). Anyone who captures one request can resend it, and
the body could be altered by anything that holds the credential. Use HTTPS (YouMail requires an
https URL) and rotate the token if it leaks.

Points that cause most failures:

- Create the webhook with the **Bearer** scheme, not Basic. Hookdeck's YouMail source and these
  examples compare one header value, and Basic is not covered.
- The key is the **whole header value including the `Bearer ` prefix**. Compare the full
  `Authorization` header to `YOUMAIL_AUTHORIZATION`; don't strip, parse or base64-decode it.
- Without an `auth` setting, YouMail sends no credential at all, so there is nothing to check.

## Implementation

There is no SDK. Verification is a constant-time string comparison.

### Node.js (Express)

Hash both sides so the buffers are equal length: `timingSafeEqual` throws on a length
mismatch otherwise.

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

app.post('/webhooks/youmail', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.YOUMAIL_AUTHORIZATION;
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
// compare with safeEqual(received, process.env.YOUMAIL_AUTHORIZATION!)
```

### Python (FastAPI)

Encode both sides to bytes. `hmac.compare_digest` on `str` raises `TypeError` for non-ASCII input.

```python
import hmac

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

# headers.get("authorization") vs os.environ["YOUMAIL_AUTHORIZATION"]
```

## Common Gotchas

- **Basic scheme**: Basic (expected as `Authorization: Basic base64(user:pass)`) would need a different expected value
  and is not covered by Hookdeck's YouMail source. Switch the webhook to Bearer.
- **Missing prefix**: the stored secret must include the prefix (expected to be `Bearer `).
- **Unconfigured secret**: reject everything if `YOUMAIL_AUTHORIZATION` is empty, otherwise an
  empty header would "match".
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before parsing;
  `express.raw({ type: '*/*' })` accepts any content type.
- **Status codes**: missing header or mismatch returns `401`; a body that isn't a JSON object `400`.
- **Hookdeck**: a Hookdeck YouMail source verifies the same header (full value). Choose the Bearer
  auth scheme on the YouMail webhook, not Basic, and paste the whole Authorization value,
  including "Bearer ".

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present, then compare the length of the received value with the
   configured one (a missing `Bearer ` prefix shows up as a 7-character difference). It is
   expected to start with `Bearer `; if it doesn't, capture a delivery and set
   `YOUMAIL_AUTHORIZATION` to the value exactly as received.
3. Check for trailing whitespace or quotes in `.env`.
4. Confirm the webhook was created with `auth` set to `Bearer` and the same `token`.
