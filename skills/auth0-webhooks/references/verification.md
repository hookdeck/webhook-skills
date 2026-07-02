# Auth0 Webhook Verification

## How It Works

Auth0 Custom Log Streams **do not sign** their requests — there is no HMAC
signature, no `webhook-signature` header, and no Standard Webhooks envelope.
Instead, authenticity is established with a **static shared secret**:

1. You configure an **Authorization Token** on the log stream in the Auth0
   Dashboard.
2. Auth0 sends that exact value in the `Authorization` header of every request.
3. Your handler compares the incoming `Authorization` header against the token
   you stored (`AUTH0_LOG_STREAM_TOKEN`) using a **timing-safe** comparison.

Because the secret is static, **HTTPS is mandatory** — it's what keeps the token
confidential in transit.

There is **no Auth0 SDK method** for verifying log stream requests (it's not a
signed webhook), so verification is a manual token comparison in every
framework.

## Implementation

### Manual Verification (Node.js)

```javascript
const crypto = require('crypto');

function verifyAuth0Token(headerValue, expectedToken) {
  if (!headerValue || !expectedToken) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expectedToken);
  // timingSafeEqual throws if lengths differ — guard first.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// In the handler:
if (!verifyAuth0Token(req.headers['authorization'], process.env.AUTH0_LOG_STREAM_TOKEN)) {
  return res.status(401).send('Unauthorized');
}
```

### Manual Verification (Python)

```python
import hmac

def verify_auth0_token(header_value: str | None, expected_token: str | None) -> bool:
    if not header_value or not expected_token:
        return False
    # compare_digest is constant-time and length-safe.
    return hmac.compare_digest(header_value, expected_token)
```

## Common Gotchas

- **No signature header.** Don't look for `webhook-signature`,
  `X-Auth0-Signature`, or `Stripe-Signature`-style headers — they don't exist.
  The only credential is the `Authorization` header.
- **Match the token exactly.** Auth0 sends whatever string you typed into the
  Authorization Token field, byte-for-byte. If you configured
  `Bearer abc123`, compare against `Bearer abc123`, not `abc123`.
- **Use a timing-safe compare.** A plain `==` leaks timing information. Use
  `crypto.timingSafeEqual` (Node) or `hmac.compare_digest` (Python), and guard
  against unequal lengths.
- **Return `2xx` fast.** Auth0 retries on non-`2xx`. Authenticate, accept the
  batch, respond, then process asynchronously.
- **The body is an array.** Iterate every record — a single request can carry
  many events. Read `event.data.type` for the event code.
- **HTTPS only.** A static bearer token over plain HTTP is trivially
  interceptable.

## Debugging Verification Failures

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Every request is `401` | Token mismatch (extra `Bearer ` prefix or whitespace) | Make the stored value byte-identical to the Dashboard's Authorization Token |
| Auth0 shows repeated retries/failures | Handler returns non-`2xx` (error, timeout) | Return `2xx` immediately; move slow work off the request path |
| `timingSafeEqual` throws | Buffers have different lengths | Length-check before comparing (shown above) |
| Header is `undefined` | Reading the wrong header name | Read `Authorization` (case-insensitive in Express/FastAPI) |
