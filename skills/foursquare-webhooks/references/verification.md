# How to Verify Foursquare Webhooks

## Does Foursquare Sign Webhooks?

No. Movement SDK server webhooks have no payload signature and no HMAC. The only
authentication is a shared secret: Foursquare includes the secret from your
Developer Console's Pilgrim page in the `Pilgrim-Secret` header of every
request, "so you know it's us".

## How It Works

- Header: `Pilgrim-Secret`
- Value: the secret exactly as shown in the console (no `Bearer`/`sha256=` prefix)
- Nothing else is signed: no timestamp, no body hash

Verification is a constant-time comparison of the header with your stored
`FOURSQUARE_PILGRIM_SECRET`.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

// Hash both sides: timingSafeEqual throws if lengths differ
const sha256 = (v) => crypto.createHash('sha256').update(v).digest();

function verifyPilgrimSecret(headerValue, expectedSecret) {
  if (!headerValue || !expectedSecret) return false;
  return crypto.timingSafeEqual(sha256(headerValue), sha256(expectedSecret));
}
```

### Python

```python
import hashlib
import hmac

def verify_pilgrim_secret(header_value, expected_secret):
    if not header_value or not expected_secret:
        return False
    return hmac.compare_digest(
        hashlib.sha256(header_value.encode()).digest(),
        hashlib.sha256(expected_secret.encode()).digest(),
    )
```

## Common Gotchas

- **Don't use `===` / `==`** on the secret. A plain comparison leaks timing.
- **Hash or length-check first.** `crypto.timingSafeEqual` throws on unequal lengths; `hmac.compare_digest` is safe but hashing keeps both languages consistent.
- **Fail closed.** If `FOURSQUARE_PILGRIM_SECRET` isn't set, return `500`; never skip the check.
- **Accept any content type.** Foursquare documents `application/json`, but read the body raw (`express.raw({ type: '*/*' })`) and parse after authenticating so a proxy that changes the content type doesn't break you.
- **Header names are case-insensitive.** Express and Next.js lowercase them (`pilgrim-secret`); FastAPI maps `pilgrim_secret` to `Pilgrim-Secret`.
- **A leaked secret can't be told apart from Foursquare.** Rotate it in the console if exposed, and use HTTPS only.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `401` on every request | Secret in your env doesn't match the Pilgrim page, or has trailing whitespace/newline |
| `500` on every request | `FOURSQUARE_PILGRIM_SECRET` not set |
| Header missing | A proxy stripped it, or the request isn't from the Movement SDK webhook |
