# How to Verify Cover Genius Offers Webhooks

## How Does Cover Genius Authenticate Webhooks?

Offers webhooks are authenticated with a shared key, not a payload signature. Cover Genius
sends your authentication key, as plain text with no prefix, in the `X-Api-Key` header. To
verify a request, compare that header with the key you gave your CSE.

| Header | Value | Required check |
|--------|-------|----------------|
| `X-Api-Key` | Your authentication key, plain text | Yes: constant-time compare with `COVER_GENIUS_API_KEY` |
| `Authorization` | `Signature ...` (HMAC-SHA256 over the `Date` header) | No, see below |
| `Date` | HTTP date, e.g. `Thu, 27 Feb 2025 05:01:47 GMT` | Only used by the optional signature |

The body is not signed, so verification does not need the raw body. Authenticate before parsing it.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

// Hash both sides: equal-length buffers, so timingSafeEqual never throws.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyCoverGeniusRequest(headers, apiKey = process.env.COVER_GENIUS_API_KEY) {
  if (!apiKey) return false; // never accept when unconfigured
  const received = headers['x-api-key'];
  return typeof received === 'string' && safeEqual(received, apiKey);
}
```

### Python

```python
import hashlib, hmac

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest()
    )

def verify_cover_genius_request(headers, api_key) -> bool:
    if not api_key:
        return False
    received = headers.get("x-api-key")
    return received is not None and safe_equal(received, api_key)
```

## The Optional Authorization Signature

Cover Genius also sends `Authorization: Signature <params>` built from your key pair with
HMAC-SHA256. Per the docs' sample code, the signed string is `date: <Date header value>`, the
HMAC is base64-encoded, and the `signature` parameter is URL-encoded. That signature covers only
the `Date` header, not the body or the event, so it adds nothing over the `X-Api-Key` check. It
isn't required and the examples skip it. If you want it anyway:

```javascript
const secret = process.env.COVER_GENIUS_API_SECRET;
const auth = headers['authorization'] || '';
if (!auth.startsWith('Signature ')) return false;
const params = Object.fromEntries(
  auth.slice('Signature '.length).split(',').map((p) => p.trim().split(/=(.*)/s).slice(0, 2))
);
const received = decodeURIComponent((params.signature || '').replace(/^"|"$/g, ''));
const expected = crypto.createHmac('sha256', secret).update(`date: ${headers['date']}`).digest('base64');
return safeEqual(expected, received);
```

Check the `algorithm` in the header rather than assuming SHA-256: the docs say sha256 is
current. A valid signature does not prove the body is untampered, and the `Date` value can be
replayed.

## Common Gotchas

- **No prefix.** The `X-Api-Key` value is the bare key. Don't strip `Bearer` or similar.
- **Fail closed.** If `COVER_GENIUS_API_KEY` is empty, reject every request. An empty-equals-empty
  compare would otherwise accept a request with no key.
- **Constant-time compare.** `timingSafeEqual` throws on different lengths, so hash both sides
  first (or check lengths) as above.
- **Any content type.** Express: use `express.raw({ type: '*/*' })` rather than `express.json()`,
  so the check runs for every content type and a bad key is `401`, not a parse error.
- **Other Cover Genius products.** XClaim (`XClaim-Signature`) and RentalCover (`X-Signature` plus
  a timestamp) use different schemes. This skill doesn't cover them.
- **Plain-text key in transit.** Use an HTTPS listener URL, and rotate the key through your CSE
  if it leaks.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always `401` | `COVER_GENIUS_API_KEY` unset, or differs from the key your CSE configured |
| `401` only locally | The tunnel or proxy strips `X-Api-Key`; check the header in the request inspector |
| `401` after key rotation | Your CSE and your env var are out of sync |
| `Authorization` signature mismatch | Signed string must be exactly `date: <Date>`; URL-decode the signature first |
