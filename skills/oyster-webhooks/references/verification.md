# How to Authenticate Oyster Webhooks

## How It Works

Oyster **does not sign payloads**: there is no HMAC, signature header or timestamp header. The
only authentication is the shared secret you register with the endpoint:

```
Authorization: Bearer <sharedSecret>
```

Oyster's docs say to "grab the Authorization header from the request and compare the value to
the shared secret": for a secret of `12345` the header is `Bearer 12345`. Points that cause
most failures:

- Compare the **whole header value including the `Bearer ` prefix**. Store the full value as
  `OYSTER_AUTHORIZATION` (`Bearer 12345`); don't strip or parse the prefix.
- The header is `Authorization`, so frameworks, proxies or API gateways that consume it for
  their own auth can hide it from your handler.

## What This Does and Doesn't Protect

A static shared credential authenticates the **sender**, not the **body**, and gives **no
replay protection**: there is no signature over the payload and no timestamp. Anything that
can read a request (a logging proxy, a misconfigured TLS hop) can reuse the secret or replay
a captured request, and nothing detects a modified body. So:

- Accept webhooks over HTTPS only.
- Dedupe on the event `id` (`wh_...`) so a replay does nothing new.
- Rotate the secret (`PATCH /v1/webhooks/{id}` with a new `sharedSecret`) if it leaks, and
  never log the header value.
- For anything sensitive, fetch the object from the Oyster API using the ID in `data` rather
  than trusting the payload fields.

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

app.post('/webhooks/oyster', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.OYSTER_AUTHORIZATION;
  const received = req.headers['authorization'];
  if (!expected || !received || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  const event = JSON.parse(req.body.toString('utf8'));
  // ...
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get('authorization'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.OYSTER_AUTHORIZATION!)
```

### Python (FastAPI)

```python
import hmac

def safe_equal(a: str, b: str) -> bool:
    # compare_digest needs bytes for non-ASCII input; a str raises TypeError
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

# headers.get("authorization") vs os.environ["OYSTER_AUTHORIZATION"]
```

## Common Gotchas

- **Missing prefix**: the stored secret must include `Bearer `, exactly as Oyster sends it.
- **Unconfigured secret**: reject everything if `OYSTER_AUTHORIZATION` is empty, otherwise an
  empty header could "match".
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before
  parsing; `express.raw({ type: '*/*' })` accepts any content type.
- **5 second timeout**: acknowledge fast and do slow work asynchronously, or Oyster retries.
- **Hookdeck**: a Hookdeck Oyster source verifies the same header (full value).

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present, then compare the length of the received value with the
   configured one (a missing `Bearer ` prefix shows up as a 7-character difference).
3. Check for trailing whitespace or quotes in `.env`.
4. Confirm the secret matches the endpoint registration (`GET /v1/webhooks`) and the
   environment (sandbox vs production) that is sending.
