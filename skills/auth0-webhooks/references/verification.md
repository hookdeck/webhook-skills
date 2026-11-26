# Auth0 Webhook Verification

## How It Works

Auth0 Event Streams **don't sign** their requests. There's no HMAC signature
or signing secret. Each stream's webhook destination has one of three
authorization methods:

| Method | What arrives |
|--------|--------------|
| `bearer` | `Authorization: Bearer <token>` |
| `basic` | `Authorization: Basic <credentials>` |
| `custom_header` | Your secret in a header whose name you choose (`header_key`) |

This skill uses bearer, which Auth0's own examples use. Your handler compares
the incoming `Authorization` header with `Bearer <token>` using a timing-safe
comparison. Because the credential is static and doesn't cover the body, HTTPS
is what keeps it secret in transit.

There's no Auth0 SDK method for this check. It's a header comparison in every
framework.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyAuth0Authorization(headerValue, token) {
  if (!headerValue || !token) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(`Bearer ${token}`);
  // timingSafeEqual throws if lengths differ, so guard first.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// In the handler:
if (!verifyAuth0Authorization(req.headers['authorization'], process.env.AUTH0_EVENT_STREAM_TOKEN)) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

### Python

```python
import hmac

def verify_auth0_authorization(header_value: str | None, token: str | None) -> bool:
    if not header_value or not token:
        return False
    # compare_digest is constant-time and safe for unequal lengths.
    return hmac.compare_digest(header_value.encode(), f"Bearer {token}".encode())
```

## Common Gotchas

- **Include the `Bearer ` prefix.** The header is `Bearer <token>`, so a
  comparison against the bare token fails every time.
- **Custom header streams.** If the stream uses `custom_header`, read the
  header you named instead of `Authorization`.
- **Use a timing-safe compare.** Use `crypto.timingSafeEqual` (Node) or
  `hmac.compare_digest` (Python) rather than `==`.
- **Return `2xx` fast.** Auth0 retries after 1s, 2s and 4s and then marks the
  event failed. A `4xx` fails it immediately, so don't return `4xx` for a
  temporary problem in your own code.
- **One event per request.** The body is a single JSON object. Read `type`
  and `data.object`.

## Debugging Verification Failures

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Every request is `401` | Comparing against the bare token, or stray whitespace | Compare against `Bearer <token>` exactly |
| Header is missing | The stream uses `custom_header` | Read the header named in the stream's `header_key` |
| Events marked failed in the Deliveries API | Handler returned non-`2xx` or a `4xx` | Return `2xx` once the header checks out, then redeliver |
| `timingSafeEqual` throws | Buffers have different lengths | Length-check before comparing (shown above) |
