# How to Verify PayTabs Webhook Signatures

## How It Works

Every callback and IPN carries a `Signature` header holding the lowercase hex HMAC-SHA256 of the raw request body, keyed with your profile ServerKey. PayTabs' PHP sample is `hash_hmac('sha256', $payload, $serverKey)`, whose default output is lowercase hex. The whole header value is one digest: there is no `sha256=` prefix, no list and no timestamp, so there is no replay window to check. There is no verification SDK.

Only callback and IPN requests are verified this way. The browser Return URL puts its signature in a `signature` form field over the sorted, non-empty, URL-encoded fields, which is a different (and not webhook) flow.

## Implementation

### Manual Verification (Node)

```javascript
const crypto = require('crypto');

function verifyPayTabsSignature(rawBody, header, secret) {
  if (typeof header !== 'string' || !secret) return false;
  if (!/^[0-9a-f]{64}$/i.test(header)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(header, 'hex'), expected);
}
```

### Manual Verification (Python)

```python
import hashlib, hmac, re

def verify_paytabs_signature(raw_body: bytes, header: str | None, secret: str | None) -> bool:
    if not header or not secret:
        return False
    if not re.fullmatch(r"[0-9a-f]{64}", header, re.IGNORECASE | re.ASCII):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(header.lower().encode("ascii"), expected.encode("ascii"))
```

## Published Test Vector

PayTabs' signature article gives a worked example with server key `SGJNZ96JLG-JDMKHGRWT9-RWRK2KJNRJ`, the body bytes

```
cartId=cart_11111&customerEmail=email%40domain.com&respCode=G84718&respMessage=Authorised&respStatus=A&tranRef=TST2215201242166
```

and the signature `7a181a32c768621eb6966107752ee70205a01f1c4403a3d13c0ff604f591f988`. Every example's test suite asserts that the verifier accepts this header for that secret and body. Note that PayTabs presents it in the Return URL section (the body there is the canonical string it hashes after sorting and URL-encoding the form fields), not as a real callback request. It is useful because it uses the same HMAC-SHA256 / lowercase hex primitive, but a callback body is the raw JSON as received.

## Common Gotchas

- **Raw body.** Verify the exact bytes received. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.arrayBuffer()`; in FastAPI use `await request.body()`. Never parse and re-serialize JSON before verifying.
- **Secret is used as-is.** The ServerKey is its UTF-8 bytes. Do not hex- or base64-decode it.
- **Return URL is not a webhook.** Do not point the Return URL at this handler.
- **CSRF.** Exempt the route in frameworks with CSRF protection.
- **Case.** Hex is compared case-insensitively. Require exactly 64 hex characters, then lowercase both sides.
- **Invalid hex truncates.** `Buffer.from(x, 'hex')` drops bad characters, so check the format before decoding. `crypto.timingSafeEqual` throws on unequal lengths.
- **Python str comparison.** `hmac.compare_digest` raises on non-ASCII `str`; compare bytes.
- **No timestamp.** Do not invent a replay window from unsigned headers or body fields. Make handlers idempotent instead.

## Debugging Verification Failures

1. Confirm you are using the ServerKey of the profile that sent the request.
2. Check the `Signature` header is exactly 64 hex characters with no prefix.
3. Log the body length and compare with what was sent; a mismatch means middleware changed the body.
4. Confirm the request is a callback or IPN and not the browser Return URL.
