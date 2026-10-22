# Unit Signature Verification

## How Does Unit Sign Webhooks?

Unit computes an HMAC-SHA1 of the **entire raw request body**, keyed with the
webhook `token` (as a UTF-8 string), base64-encodes the digest and sends it in
`X-Unit-Signature`. There is no timestamp, no prefix and no SDK helper.

## Node.js

```javascript
const crypto = require('crypto');

function verifyUnitSignature(rawBody, signatureHeader, token) {
  if (!signatureHeader || !token) return false;
  const expected = crypto.createHmac('sha1', token).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

## Python

```python
import base64, hashlib, hmac

def verify_unit_signature(raw_body: bytes, signature: str | None, token: str) -> bool:
    if not signature or not token:
        return False
    digest = hmac.new(token.encode("utf-8"), raw_body, hashlib.sha1).digest()
    return hmac.compare_digest(base64.b64encode(digest), signature.encode("utf-8"))
```

## Common Gotchas

- **Raw body.** Unit's own sample only reads `application/json` and
  `application/vnd.api+json`. Use `express.raw({ type: '*/*' })` so any content type is read as bytes.
- **Don't re-serialize.** `JSON.stringify(JSON.parse(body))` changes bytes and breaks the HMAC.
- **Token is a plain string.** Don't base64- or hex-decode it.
- **Base64 digest.** Compare base64 strings, not hex.
- **Use a timing-safe compare.** The docs sample uses `==`; prefer `timingSafeEqual` / `compare_digest`.
- **Status codes.** Return `200` on success. With `AtMostOnce`, other codes are never retried.
- **No replay protection.** Dedupe on each event's `id`.

## Debugging Verification Failures

1. Confirm `UNIT_WEBHOOK_TOKEN` equals the token on that webhook (sandbox and live differ).
2. Log `rawBody.length` and compare it to the request's content length; a mismatch means a body parser ran first.
3. Check a proxy isn't rewriting the body.
4. Recompute with `openssl dgst -sha1 -hmac "$TOKEN" -binary body.json | base64`.
