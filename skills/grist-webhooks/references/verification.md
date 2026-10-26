# How to Authenticate Grist Webhooks

## How It Works

Grist **does not sign payloads**: there is no HMAC, timestamp or signature header. The only
credential is the optional **Header Authorization** field of the webhook, "a static string"
that Grist supplies in the `Authorization` HTTP header, typically an API token such as
`Bearer my-secret-token`.

Points that cause most failures:

- The key is the **whole header value**, including any `Bearer ` or `Basic ` prefix. Paste the
  Header Authorization value exactly as set in Grist, then compare the full `Authorization`
  header to it. Don't strip, parse or base64-decode the prefix.
- A missing header or a mismatch is a `401`.
- The header is only sent if Header Authorization was filled in.

## A Static Credential Is Not a Signature

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp). Anyone who captures one request can resend it or
send a different body with the same header. Use HTTPS, treat the value like a password, and
rotate it in Grist if it leaks.

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

app.post('/webhooks/grist', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.GRIST_AUTHORIZATION;
  const received = req.headers['authorization'];
  if (!expected || !received || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  const rows = JSON.parse(req.body.toString('utf8')); // array of row objects
  // ...
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get('authorization'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.GRIST_AUTHORIZATION!)
const rows = JSON.parse(await request.text());
```

### Python (FastAPI)

```python
import hmac

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

# request.headers.get("authorization") vs os.environ["GRIST_AUTHORIZATION"]
```

## Common Gotchas

- **Prefix stripped**: if you store only the token and the header is `Bearer <token>`, the
  compare fails. Store the full value.
- **Unconfigured secret**: reject everything if `GRIST_AUTHORIZATION` is empty, otherwise an
  empty header would "match".
- **Body is an array**: the payload is a JSON array of rows, not an object. Parse it only
  after the credential check; `express.raw({ type: '*/*' })` accepts any content type.
- **No Header Authorization set in Grist**: requests arrive with no `Authorization` header and
  every one gets a 401. Set the field in the webhook config.
- **Retries**: Grist retries until it gets a success, so a 401 keeps the payload queued.
- **Hookdeck**: a Hookdeck Grist source verifies the same header (full value). Paste the Header
  Authorization value exactly as set in Grist, including any "Bearer " or "Basic " prefix.

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present, then compare the length of the received value with the
   configured one (a missing `Bearer ` prefix shows up as a 7-character difference).
3. Check for trailing whitespace or quotes in `.env`.
4. Check the webhook's **Status** in Grist for the response code it last saw.
