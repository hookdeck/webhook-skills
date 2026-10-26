# How to Authenticate Harbor Webhooks

## How It Works

Harbor **does not sign payloads**: there is no HMAC, signature header or timestamp. The only
authentication is the optional **Auth Header** field on the webhook. Harbor sets it as the
`Authorization` header of every delivery, verbatim, and always sends a `POST`:

```
Authorization: <whatever you typed in the Auth Header field>
```

Points that cause most failures:

- The value is whatever you typed, for example `Bearer <token>` or `Basic <base64>`. Compare the
  **whole header value**, scheme prefix included, to `HARBOR_AUTHORIZATION`. Don't strip, parse
  or base64-decode the prefix.
- Use the HTTP notify type and paste the Auth Header value exactly as set in Harbor, including
  any "Bearer " or "Basic " prefix.
- If you leave the Auth Header empty Harbor sends no `Authorization` header, and there is
  nothing to verify.

## What Does a Shared Credential Protect Against?

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection** (no signature, no timestamp). Anyone who captures one request can replay it or
send different bodies with the same header. So:

- Serve the endpoint over HTTPS only.
- Rotate the Auth Header in Harbor (and `HARBOR_AUTHORIZATION`) if it leaks.
- Make handlers idempotent, since Harbor retries failed deliveries and a replay looks identical.

## Implementation

There is no SDK. Verification is a constant-time string comparison. Reject when the secret is
unconfigured, otherwise an empty header could "match".

### Node.js (Express)

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false; // timingSafeEqual throws on unequal lengths
  return crypto.timingSafeEqual(ba, bb);
}

app.post('/webhooks/harbor', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.HARBOR_AUTHORIZATION;
  const received = req.headers['authorization'];
  if (!expected || !received || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  const payload = JSON.parse(req.body.toString('utf8'));
  // dispatch on payload.type (Default or CloudEvents)
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get('authorization'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.HARBOR_AUTHORIZATION!) as above
```

### Python (FastAPI)

```python
import hmac

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides: compare_digest raises TypeError on a non-ASCII str.
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

# headers.get("authorization") vs os.environ["HARBOR_AUTHORIZATION"]
```

## Common Gotchas

- **Dropped prefix**: `HARBOR_AUTHORIZATION` must include `Bearer ` or `Basic ` if you typed it
  in Harbor. The compare is on the whole value.
- **Unconfigured secret**: reject everything if `HARBOR_AUTHORIZATION` is empty.
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before
  parsing; `express.raw({ type: '*/*' })` accepts any content type.
- **Both payload formats**: the check is identical for Default and CloudEvents deliveries.
- **Proxies**: some reverse proxies and API gateways consume or rewrite `Authorization`. Make
  sure it reaches your handler unchanged.
- **Hookdeck**: a Hookdeck Harbor source compares the same header (full value). Use the HTTP
  notify type and paste the Auth Header value exactly as set in Harbor, including any
  "Bearer " or "Basic " prefix.

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `authorization` is present. If not, the Auth Header field is empty in Harbor.
3. Compare the length of the received value with the configured one (a missing `Bearer `
   prefix shows up as a 7-character difference).
4. Check for trailing whitespace or quotes in `.env`.
5. Re-save the Auth Header in Harbor and update `HARBOR_AUTHORIZATION` to match.
