# How to Authenticate DoorDash Drive Webhooks

## How It Works

DoorDash Drive **does not sign payloads**: there is no HMAC, timestamp or signature header. The only
credential is the text you entered under **Basic Auth** in the Developer Portal, which DoorDash sends
as the HTTP `Authorization` header:

```
Authorization: <exactly the text you entered>
```

A static shared credential authenticates the sender, not the body, and gives no replay protection (no
signature, no timestamp): anyone who captures a request can resend it. Use HTTPS, rotate the
credential if it leaks, and make handlers idempotent.

Points that cause most failures:

- The "Basic Auth" label is misleading. DoorDash does not build a `Basic base64(user:pass)` header; it
  sends your text as is, often a bare token. Don't decode it.
- The key is the **whole header value**. Compare the full `Authorization` header to
  `DOORDASH_DRIVE_AUTHORIZATION`; don't strip or add a scheme prefix.
- OAuth (the other portal option) isn't covered here.

## Implementation

There is no SDK. Verification is a constant-time string comparison.

### Node.js (Express)

Hash both sides first so the buffers are equal length (`timingSafeEqual` throws on a length mismatch).

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

app.post('/webhooks/doordash-drive', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.DOORDASH_DRIVE_AUTHORIZATION;
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
// compare with safeEqual(received, process.env.DOORDASH_DRIVE_AUTHORIZATION!)
```

### Python (FastAPI)

Encode both sides to bytes: `hmac.compare_digest` raises `TypeError` on a non-ASCII `str`.

```python
import hmac

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

# headers.get("authorization") vs os.environ["DOORDASH_DRIVE_AUTHORIZATION"]
```

## Common Gotchas

- **Decoding as Basic**: don't split on `:` or base64-decode. Compare the raw header.
- **Missing prefix**: if you typed `Bearer abc` in the portal, the stored value is `Bearer abc`.
- **Unconfigured secret**: reject everything if `DOORDASH_DRIVE_AUTHORIZATION` is empty, otherwise an
  empty header would "match".
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before parsing;
  `express.raw({ type: '*/*' })` accepts any content type.
- **Retries**: DoorDash resends anything other than `200 OK` (3 attempts), including your `401`s.
- **One endpoint per environment**: Sandbox and Production are configured separately; use a
  credential for each.
- **Hookdeck**: a Hookdeck DoorDash Drive source compares the same whole `Authorization` value.

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present, then compare the length of the received value with the
   configured one (a missing prefix shows up as a length difference).
3. Check for trailing whitespace or quotes in `.env`.
4. Confirm the credential matches the environment (Sandbox vs Production) that is sending.
