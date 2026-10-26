# How to Authenticate 8x8 Webhooks

## How It Works

8x8 **does not sign payloads**: there is no HMAC, timestamp or signature header. The only
authentication is the optional **HTTP Authorization** value you set on the webhook, which
8x8 sends as the `Authorization` header:

```
Authorization: Bearer 9QQhlsEb8VY
Authorization: Basic dXNlcjpwYXNzd29yZA==
```

Paste the HTTP Authorization value exactly as set in 8x8, including any "Bearer " or
"Basic " prefix. OAuth authentication is not supported.

Points that cause most failures:

- Compare the **whole header value** to `EIGHT_X_EIGHT_AUTHORIZATION`, scheme prefix included.
- **Never decode a Basic value** and never strip `Bearer `. Both are plain strings you chose.
- The credential is optional in 8x8. If you leave the field empty no `Authorization` header
  is sent, and there is nothing to verify, so always set one.

## A Static Credential Is Not a Signature

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp). Anyone who captures a request can resend it or
send a modified body with the same header. Use HTTPS, rotate the credential if it leaks,
and make handlers idempotent.

Not covered here: the OAuth client-credentials option (rotating tokens) and 8x8 Contact
Center Chat webhooks signed with `x-8x8-signature` (JWS).

## Implementation

There is no SDK. Verification is a constant-time string comparison.

### Node.js (Express)

Hash both sides first so the buffers are equal length: `timingSafeEqual` throws on a length
mismatch otherwise.

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

app.post('/webhooks/8x8', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.EIGHT_X_EIGHT_AUTHORIZATION;
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
// compare with safeEqual(received, process.env.EIGHT_X_EIGHT_AUTHORIZATION!)
const event = JSON.parse(await request.text());          // only after the check
```

### Python (FastAPI)

Encode both sides to bytes: `hmac.compare_digest` raises `TypeError` on a non-ASCII `str`.

```python
import hmac

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

# headers.get("authorization") vs os.environ["EIGHT_X_EIGHT_AUTHORIZATION"]
```

(The FastAPI example hashes both sides with SHA-256 first, so the comparison does not leak
the credential's length either.)

## Common Gotchas

- **Prefix dropped**: storing only `9QQhlsEb8VY` instead of `Bearer 9QQhlsEb8VY` always fails.
- **Basic decoded**: don't base64-decode; compare `Basic dXNlcjpwYXNzd29yZA==` as is.
- **Unconfigured secret**: reject everything if `EIGHT_X_EIGHT_AUTHORIZATION` is empty,
  otherwise an empty header could "match".
- **Raw body**: there is nothing to sign, but authenticate before parsing; use
  `express.raw({ type: '*/*' })` so any content type is accepted.
- **Retries**: a 401 triggers 8x8 retries (1, 10, 30, 90 seconds), so fix the credential
  rather than waiting.
- **Hookdeck**: a Hookdeck 8x8 source compares the same whole header value.

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging values.
2. Confirm `Authorization` is present; if not, the HTTP Authorization field is empty or the
   webhook being fired is a different one.
3. Compare the length of the received and configured values. A difference of 7 characters
   means a missing `Bearer ` prefix; 6 means `Basic `.
4. Check for trailing whitespace or quotes in `.env`.
5. Confirm the credential belongs to the sub-account and webhook that is sending.
