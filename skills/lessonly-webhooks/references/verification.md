# How to Authenticate Lessonly Webhooks

## How It Works

Lessonly **does not sign payloads**: there is no HMAC, timestamp or signature header. The only
credential is the `Authorization` header, whose value is whatever you set in
`lesson_completed_callback_authorization`:

```
Authorization: <exact value you configured>
```

Points that cause most failures:

- Lessonly sends the value **verbatim** and adds no scheme. `Tm93IGlzIHRo` arrives as
  `Authorization: Tm93IGlzIHRo`.
- If you included `Bearer ` or `Basic ` it is part of the value. Compare the **whole header**
  to `LESSONLY_AUTHORIZATION`. Don't strip, parse or base64-decode the prefix.
- The parameter is optional in Lessonly. If it was never set, no header is sent.

## What a Static Credential Does Not Give You

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection** (no signature, no timestamp). Anyone who captures one request can resend it, or
send a different body with the same header. Mitigate it by:

- receiving over HTTPS only
- making the handler idempotent
- rotating the credential if it leaks (set a new `lesson_completed_callback_authorization`)

## Implementation

There is no SDK. Verification is a constant-time string comparison. Node hashes both sides
with SHA-256 so the buffers are equal length (`timingSafeEqual` throws on a length mismatch);
Python compares bytes with `hmac.compare_digest`.

### Node.js (Express)

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

app.post('/webhooks/lessonly', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.LESSONLY_AUTHORIZATION;
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
// compare with safeEqual(received, process.env.LESSONLY_AUTHORIZATION!)
```

### Python (FastAPI)

```python
import hmac

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides: compare_digest on str raises TypeError for non-ASCII.
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

# headers.get("authorization") vs os.environ["LESSONLY_AUTHORIZATION"]
```

## Common Gotchas

- **Prefix handling**: store the value exactly as set in Lessonly, `Bearer ` or `Basic ` included.
  Don't add or remove a scheme in code.
- **Unconfigured secret**: reject everything if `LESSONLY_AUTHORIZATION` is empty, otherwise an
  empty header would "match".
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before parsing;
  `express.raw({ type: '*/*' })` accepts any content type.
- **Header never set**: if requests arrive without `Authorization`, `lesson_completed_callback_authorization`
  was not configured. Set it with the company settings API; don't switch the check off.
- **Hookdeck**: a Hookdeck Lessonly source compares the same header (full value). Paste the
  Authorization value exactly as set in Lessonly, including any "Bearer " or "Basic " prefix.

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present, then compare the length of the received value with the
   configured one (a dropped `Bearer ` prefix shows up as a 7-character difference).
3. Check for trailing whitespace or quotes in `.env`.
4. Re-read the stored value with the `PUT` response (or the Lessonly settings page) and compare.
