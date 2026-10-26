# How to Authenticate Navattic Webhooks

## How It Works

Navattic **does not sign payloads**: there is no HMAC, timestamp or signature header. The only
authentication is an `Authorization` header, sent only when configured on the webhook:

```
Authorization: Basic <credentials>
Authorization: Bearer <token>
```

Points that cause most failures:

- The key is the **whole header value including the scheme prefix**. Compare the full header to
  `NAVATTIC_AUTHORIZATION` (for example `Bearer abc123`), as Hookdeck's Navattic source does.
  Don't strip the prefix, parse it, or base64-decode Basic credentials.
- The header is sent only after you configure it on the webhook.
- Check it before reading the body, for every HTTP method.

## What This Does and Doesn't Protect

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp). Anyone who has the credential can send any payload, and a captured
request can be replayed. Use HTTPS only, and rotate the credential in Navattic and in
`NAVATTIC_AUTHORIZATION` if it leaks. Make handlers idempotent.

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

app.post('/webhooks/navattic', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.NAVATTIC_AUTHORIZATION;
  const received = req.headers['authorization'];
  if (!expected || !received || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  // parse req.body (a Buffer) only after the check
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get('authorization'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.NAVATTIC_AUTHORIZATION!)
```

### Python (FastAPI)

```python
import hashlib, hmac

def safe_equal(a: str, b: str) -> bool:
    # compare_digest on bytes: passing str raises TypeError on non-ASCII input
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

# headers.get("authorization") vs os.environ["NAVATTIC_AUTHORIZATION"]
```

## Common Gotchas

- **Missing prefix**: the stored secret must include `Basic ` or `Bearer `.
- **Decoding Basic credentials**: don't. Compare the header string as sent.
- **Unconfigured secret**: reject everything if `NAVATTIC_AUTHORIZATION` is empty, otherwise an
  empty header would "match".
- **Header not configured in Navattic**: Navattic then sends no `Authorization` header and every
  request gets a 401. Add the credential to the webhook; don't switch verification off.
- **HTTP method**: the docs don't name it. Accept `GET`, `POST`, `PUT`, `PATCH` and `DELETE`, and
  allow the same on the Hookdeck source (which pre-selects `POST` only).
- **Raw body**: there is nothing to sign, but authenticate before parsing; `express.raw({ type: '*/*' })`
  accepts any content type.

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present, then compare the length of the received value with the
   configured one (a missing `Bearer ` prefix shows up as a 7-character difference, `Basic ` as 6).
3. Check for trailing whitespace or quotes in `.env`.
4. Confirm the credential in Navattic matches `NAVATTIC_AUTHORIZATION` exactly.
