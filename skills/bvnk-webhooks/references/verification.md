# How to Verify BVNK Webhook Signatures

## How It Works

BVNK sends one header, `x-signature`, holding the standard base64 (padded, 44 characters) HMAC-SHA256 of the raw request body. There is no prefix, timestamp or id in the signed message.

- Key: the secret from the webhook's **Public Key** field, as UTF-8 bytes. It looks like base64 but is **not** decoded.
- Message: the body bytes exactly as received.
- Header value: compared whole, as one digest. There is no list or `t=`/`v1=` parsing.

BVNK's docs show this in Java, Python and PHP, and note: "Secret key from webhook configuration (used as string directly, not Base64 decoded)".

## Implementation

BVNK has no webhook-verification SDK, so all three examples verify manually.

```javascript
const crypto = require('crypto');

function verifyBvnk(rawBody, signatureHeader, secret) {
  if (!secret || typeof signatureHeader !== 'string') return false;
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const received = Buffer.from(signatureHeader, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return received.length === wanted.length && crypto.timingSafeEqual(received, wanted);
}
```

```python
def verify_bvnk(raw_body: bytes, signature_header, secret: str) -> bool:
    if not secret or not signature_header:
        return False
    if not re.fullmatch(r"[A-Za-z0-9+/]{43}=", signature_header):
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(signature_header.encode("ascii"), base64.b64encode(digest))
```

## Published Test Vector

BVNK's docs include a worked example, and every example's tests use it:

- Secret: `JUL5QkQrpZYwW+Kf03QSrb70CG+ea/j8E/JfslENaXhd0AGBDbAtYYP2MdjkYDqiwjBtrtQXsUIbtAf7IGEGfg==` (used as a UTF-8 string)
- Body: the `bvnk:ledger:report:ready` payload shown in [BVNK's docs](https://docs.bvnk.com/bvnk/get-started/create-webhook-listener#validate-webhooks), byte for byte (compact JSON)
- `x-signature`: `VWEtiJu/7dLrq0ZtXS0HbGDPy6Re86oZeTnEEc9mlxg=`

## Common Gotchas

- **Do not base64-decode the secret.** It looks like base64, but BVNK uses the string's UTF-8 bytes. Decoding it gives a different key and every signature fails.
- **Use the raw body.** Express: `express.raw({ type: '*/*' })`; Next.js: `await request.arrayBuffer()`; FastAPI: `await request.body()`. Parse JSON only after the check. Any re-serialization changes the bytes.
- **Compare base64 exactly.** A value whose last character carries stray low bits decodes to the same bytes, but Hookdeck rejects it, so the examples validate the 44-character form and compare strings. Never call `Buffer.from(sig, 'base64')` on an unvalidated value: it silently drops bad characters.
- **No timestamp is signed**, so there is no replay window. Do not invent one from unsigned headers or body fields; use `eventId` for idempotency.
- **Legacy webhooks fail.** Bodies with `"event": "statusChanged"` use hex HMAC-SHA256 over the webhook path, content type and payload. They are not verified by this scheme.
- **The field is called "Public Key"** in the BVNK Portal, but it is the HMAC secret.

## Debugging Verification Failures

- Every request fails: check you pasted the Public Key value without quotes or whitespace, and that you did not base64-decode it.
- Only some requests fail: look for `"event": "statusChanged"` in the body (legacy scheme).
- Valid-looking signatures fail: check that a proxy or middleware is not parsing and re-serializing the body.
