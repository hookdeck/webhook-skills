# How to Authenticate Pax8 Webhooks

## How It Works

Pax8 **does not sign payloads**: there is no HMAC, timestamp or signature header. The FAQ says
HMAC is "not yet" supported and suggests a static secret instead. The only authentication is
the optional `authorization` field of the webhook object, which Pax8 sends back in the
`Authorization` header "exactly as you inputed":

```
Authorization: Bearer my_super_secret
```

Points that cause most failures:

- Compare the **whole header value** to `PAX8_AUTHORIZATION`. If you entered `Bearer abc`,
  the secret is `Bearer abc`. Don't strip, parse or base64-decode a `Bearer ` or `Basic ` prefix.
- If you entered a bare value (`my_super_secret`) there is no prefix, and none is added.
- The field is optional. Without it Pax8 sends no `Authorization` header, so set it.

## Security Limits

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp): anyone who captures a request can resend it or alter
the body in transit if TLS is not in place. So:

- Use HTTPS only (Pax8 requires an `https` url).
- Make handlers idempotent (see webhook-handler-patterns).
- Rotate the credential if it leaks: update it with `POST /webhooks/{id}/configuration` and
  change `PAX8_AUTHORIZATION` at the same time.

## Implementation

There is no SDK. Verification is a constant-time string comparison. Reject when the secret is
unconfigured, so an empty header can never "match".

### Node.js (Express)

```javascript
const crypto = require('crypto');

// Hash both sides so the buffers are equal length; timingSafeEqual throws otherwise.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

app.post('/webhooks/pax8', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.PAX8_AUTHORIZATION;
  const received = req.headers['authorization'];
  if (!expected || !received || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  const payload = JSON.parse(req.body.toString('utf8')); // parse only after the check
  // ...
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get('authorization'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.PAX8_AUTHORIZATION!)
```

### Python (FastAPI)

```python
import hmac

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

# headers.get("authorization") vs os.environ["PAX8_AUTHORIZATION"]
```

## Common Gotchas

- **Prefix handling**: the stored secret must include `Bearer ` / `Basic ` if you typed it in Pax8.
- **Unconfigured secret**: reject everything if `PAX8_AUTHORIZATION` is empty.
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before
  parsing; `express.raw({ type: '*/*' })` accepts any content type.
- **Wrong credential**: don't confuse the Pax8 OAuth token you use to call Pax8's API with the
  `authorization` value Pax8 sends to you.
- **Timeouts**: respond within 10 seconds or the attempt is marked failed and retried.
- **Hookdeck**: a Hookdeck Pax8 source (`PAX8`) compares the same whole header value.

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present. If not, the webhook was created without `authorization`.
3. Compare the length of the received value with the configured one (a missing `Bearer ` prefix
   shows up as a 7-character difference).
4. Check for trailing whitespace or quotes in `.env`.
5. Fetch the delivery log (`GET /webhooks/{webhookId}/logs`) to see the status Pax8 recorded.
