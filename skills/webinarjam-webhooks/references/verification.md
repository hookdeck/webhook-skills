# How to Authenticate WebinarJam Webhooks

## How It Works

WebinarJam and EverWebinar **do not sign** Custom Webhook requests: there is no HMAC, signature
header or timestamp. The only authentication is a header you add on the integration:

| Authentication type | Header sent |
|---------------------|-------------|
| Bearer token | `Authorization: Bearer <token>` |
| Custom header | The name and value you entered |

For the Bearer token option, enter Authorization as the header name and "Bearer <token>" as the value.

Points that cause most failures:

- The header name is **user-chosen**, so read it from `WEBINARJAM_WEBHOOK_HEADER` (default
  `Authorization`) and look it up case-insensitively.
- Compare the **whole header value**, including any `Bearer ` prefix, with
  `WEBINARJAM_WEBHOOK_SECRET`. Don't strip or parse the prefix. This is what Hookdeck's WebinarJam
  source does too (header name plus exact whole header value).
- No header or a mismatch returns `401`.

## What Does a Static Credential Protect?

A static shared credential authenticates the **sender**, not the **body**, and gives **no
replay protection**: there is no signature over the payload and no timestamp. Anyone who
captures a request can replay it or reuse the credential. So:

- Use HTTPS only.
- Make handlers idempotent.
- Rotate the credential in WebinarJam and your environment if it leaks.

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

app.post('/webhooks/webinarjam', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.WEBINARJAM_WEBHOOK_SECRET;
  if (!expected) return res.status(500).end();
  const name = (process.env.WEBINARJAM_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = req.headers[name];
  if (typeof received !== 'string' || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  const payload = JSON.parse(req.body.toString('utf8'));
  // ...
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get(process.env.WEBINARJAM_WEBHOOK_HEADER || 'Authorization'); // case-insensitive
// compare with safeEqual(received, process.env.WEBINARJAM_WEBHOOK_SECRET!)
```

### Python (FastAPI)

```python
import hmac, os

def safe_equal(a: str, b: str) -> bool:
    # bytes, never str: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

# request.headers.get(os.environ.get("WEBINARJAM_WEBHOOK_HEADER") or "Authorization")
# vs os.environ["WEBINARJAM_WEBHOOK_SECRET"]
```

## Common Gotchas

- **Prefix mismatch**: if WebinarJam sends `Bearer abc`, the secret must be `Bearer abc`, not `abc`.
- **Wrong header name**: with the Custom header option the name is whatever you typed.
- **Unconfigured secret**: reject everything (the examples return `500`) if
  `WEBINARJAM_WEBHOOK_SECRET` is empty, otherwise an empty header would "match".
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before parsing;
  `express.raw({ type: '*/*' })` accepts any content type.
- **Body key-value authentication**: WebinarJam can also send key-value pairs in the body, but a
  body field is not read by these examples or by Hookdeck's source. Use a header.
- **Hookdeck**: a Hookdeck WebinarJam source verifies the same header (name and whole value).

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm the configured header is present, then compare the length of the received value with
   the configured one (a missing `Bearer ` prefix shows up as a 7-character difference).
3. Check for trailing whitespace or quotes in `.env`.
4. Confirm the base URL's integration (WebinarJam vs EverWebinar) is the one you configured.
