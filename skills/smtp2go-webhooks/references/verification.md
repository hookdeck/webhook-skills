# How to Authenticate SMTP2GO Webhooks

## How It Works

SMTP2GO **does not sign payloads**: there is no HMAC, signature header or timestamp. The only credential is the optional `Authorization` header configured on the webhook (a bearer or basic header).

Set an Authorization header on the SMTP2GO webhook and paste the full value, including the "Bearer " or "Basic " prefix.

Points that cause most failures:

- The docs don't print the exact outgoing header. Capture one delivery and set `SMTP2GO_AUTHORIZATION` to exactly what arrives in `Authorization` (expected `Bearer <token>` or `Basic <base64>`).
- Compare the **whole header value** including the scheme prefix. Don't strip, parse or base64-decode it. A Hookdeck SMTP2GO source does the same.
- Reject everything if `SMTP2GO_AUTHORIZATION` is empty, otherwise a missing header could "match".

## What This Does and Doesn't Give You

A static shared credential authenticates the sender, not the body, and gives no replay protection (no signature, no timestamp). Anyone who captures a request can replay it, and the body isn't tied to the credential. So:

- Use HTTPS only
- Rotate the credential if it leaks
- Make handlers idempotent (dedupe on the webhook `id`)
- Optionally also allow SMTP2GO's delivery IPs (A record for `webhooks.smtp2go.com`)

## Implementation

There is no SDK. Verification is a constant-time string comparison. Hash both sides so the buffers are equal length: `timingSafeEqual` throws on a length mismatch otherwise.

### Node.js (Express)

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

app.post('/webhooks/smtp2go', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.SMTP2GO_AUTHORIZATION;
  const received = req.headers['authorization'];
  if (!expected || !received || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  // Parse only now: JSON or application/x-www-form-urlencoded
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get('authorization'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.SMTP2GO_AUTHORIZATION!)
const raw = await request.text(); // after the check
```

### Python (FastAPI)

```python
import hmac

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides to bytes: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

# headers.get("authorization") vs os.environ["SMTP2GO_AUTHORIZATION"]
```

## Parsing the Body After the Check

- `application/json`: `JSON.parse(raw)` / `json.loads(raw)`
- `application/x-www-form-urlencoded`: `new URLSearchParams(raw)` / `urllib.parse.parse_qs(raw)`

Both give flat parameters. Return `400` if the body can't be parsed as either.

## Common Gotchas

- **Prefix handling**: store `Bearer <token>` or `Basic <base64>` in full. A bare token never matches.
- **Wrong header**: the credential arrives in `Authorization`.
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before parsing; `express.raw({ type: '*/*' })` accepts any content type.
- **Output type**: JSON and form-encoded are chosen per webhook, so handle both.
- **Header not configured**: if deliveries arrive with no `Authorization` header, it wasn't set on the webhook. Set it; don't switch verification off.
- **Hookdeck**: a Hookdeck SMTP2GO source verifies the same header (full value).

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present, then compare the length of the received value with the configured one (a missing `Bearer ` prefix shows up as a 7-character difference).
3. Check for trailing whitespace or quotes in `.env`.
4. Re-capture a delivery and copy the header exactly; for `Basic`, store the base64 SMTP2GO sends, not `user:pass`.
