# How to Authenticate Belvo Webhooks

## How It Works

Belvo **does not sign payloads**: there is no HMAC, timestamp or signature header. The only
authentication is an optional static credential, delivered in the `Authorization` header:

```
Authorization: Bearer <token>
```

- **Payments Mexico**: you enter a token and Belvo sends `Bearer <token>`.
- **Payments Brazil**: the field takes "an optional bearer token"; the docs don't show the header
  itself, so confirm it arrives as `Bearer <token>` with a test delivery.
- **Aggregation**: you enter `Bearer <token>` or `Basic <base64>` and Belvo sends it as entered.

Points that cause most failures:

- The key is the **whole header value including the scheme** (`Bearer `/`Basic `). Compare the
  full header to `BELVO_AUTHORIZATION`; don't strip, split or add the prefix.
- Belvo can send `Bearer` or `Basic`: compare the whole value either way.
- It is sent only when you set an authentication value on the webhook.

## What Does a Static Credential Protect?

It authenticates the **sender**, not the **body**. There is no signature, so you can't prove the
payload is untampered, and there is no timestamp, so a captured request can be replayed.
Use HTTPS only, treat the credential like a password, **rotate it if it leaks**, and make
handlers idempotent. Rotating means updating the webhook in Belvo and `BELVO_AUTHORIZATION` together.

## Implementation

There is no SDK. Verification is a constant-time string comparison. Hash both sides first so the
buffers are equal length: `timingSafeEqual` throws on a length mismatch otherwise.

### Node.js (Express)

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

app.post('/webhooks/belvo', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.BELVO_AUTHORIZATION;
  const received = req.headers['authorization'];
  if (!expected || !received || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  const payload = JSON.parse(req.body.toString('utf8'));
  // payload.eventCode (Mexico), payload.resource (Brazil V2) or payload.webhook_code (Brazil V1, Aggregation)
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get('authorization'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.BELVO_AUTHORIZATION!)
```

### Python (FastAPI)

```python
import hashlib, hmac

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(
        hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest()
    )

# headers.get("authorization") vs os.environ["BELVO_AUTHORIZATION"]
```

## Common Gotchas

- **Missing prefix**: the stored secret must include `Bearer ` (or `Basic `).
- **Aggregation vs Payments**: in Aggregation you type the full value; in Payments you type only
  the token and Belvo adds `Bearer `. Either way, store what arrives on the wire.
- **Unconfigured secret**: reject everything if `BELVO_AUTHORIZATION` is empty, otherwise an
  empty header would "match".
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before parsing;
  `express.raw({ type: '*/*' })` accepts any content type.
- **A `401` is final for Payments**: Belvo never retries `4xx`, so a wrong credential during
  rollout loses the event. Return `5xx` only for genuine server errors.
- **Hookdeck**: a Hookdeck Belvo source verifies the same header (full value).

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present, then compare the length of the received value with the
   configured one (a missing `Bearer ` prefix shows up as a 7-character difference).
3. Check for trailing whitespace or quotes in `.env`.
4. Confirm the credential matches the webhook (sandbox vs production) that is sending.
5. Proxies or gateways that consume `Authorization` can remove it before your handler sees it.
