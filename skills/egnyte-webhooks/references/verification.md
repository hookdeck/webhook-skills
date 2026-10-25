# How to Authenticate Egnyte Webhooks

## How It Works

Egnyte **does not sign payloads**: there is no HMAC, signature header or timestamp. Each
delivery carries an `Authorization` header whose value is the `authHeader` you configured when
registering the webhook. Validate it on every request.

Points that cause most failures:

- The key is the **whole header value including any scheme prefix** (for example
  `Bearer secret-token-12345`). Compare the full `Authorization` header to
  `EGNYTE_AUTHORIZATION`; don't strip, parse or base64-decode the prefix.
- `authHeader` is optional at registration. Without it Egnyte sends no credential, so there is
  nothing to verify. Set it.
- Missing header or mismatch: respond `401`.

## What Does a Static Credential Protect Against?

A static shared credential authenticates the **sender**, not the **body**: anyone who learns it
can send any payload, and a captured request can be replayed because there is no signature and
no timestamp. So:

- Use HTTPS only (Egnyte requires it).
- Treat the `authHeader` like a password, and rotate it with `PUT /pubapi/v1/webhooks/{webhookId}`
  if it leaks.
- Dedupe on each event's `eventId` so replays and Egnyte retries are harmless.

## Implementation

There is no SDK. Verification is a constant-time string comparison.

### Node.js (Express)

Hash both sides first so the buffers are equal length: `timingSafeEqual` throws on a length
mismatch otherwise.

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

app.post('/webhooks/egnyte', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.EGNYTE_AUTHORIZATION;
  const received = req.headers['authorization'];
  if (!expected || !received || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  const { data } = JSON.parse(req.body.toString('utf8'));
  // loop over data[] and dispatch on eventType ...
  res.status(200).end();
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get('authorization'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.EGNYTE_AUTHORIZATION!)
```

### Python (FastAPI)

Encode both sides to bytes: `hmac.compare_digest` raises `TypeError` on a `str` containing
non-ASCII characters.

```python
import hmac

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

# headers.get("authorization") vs os.environ["EGNYTE_AUTHORIZATION"]
```

## Common Gotchas

- **Missing prefix**: the stored secret must include `Bearer ` if the `authHeader` you
  registered did.
- **Unconfigured secret**: reject everything if `EGNYTE_AUTHORIZATION` is empty, otherwise an
  empty header would "match".
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before
  parsing; `express.raw({ type: '*/*' })` accepts any content type.
- **Disabled webhook**: Egnyte disables a registration after the four delivery attempts fail.
  A wrong credential on your side (401) causes exactly that, so fix it and re-enable the
  webhook.
- **Hookdeck**: a Hookdeck Egnyte source verifies the same header (full value). Paste the
  authHeader value exactly as set on the Egnyte webhook, including any "Bearer " prefix.

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present. If not, the webhook was registered without `authHeader`;
   update it with `PUT`.
3. Compare the length of the received value with the configured one (a missing `Bearer ` prefix
   shows up as a 7-character difference).
4. Check for trailing whitespace or quotes in `.env`.
5. Fetch `GET /pubapi/v1/webhooks/{webhookId}/details` and compare `authHeader` with your secret.
