# How to Verify Jobber Webhook Signatures

## How It Works

Every Jobber webhook carries `X-Jobber-Hmac-SHA256`:

```
base64( HMAC-SHA256( rawBody, appOAuthClientSecret ) )
```

- Key: your app's OAuth client secret
- Message: the exact raw request body bytes (no timestamp or ID prefix)
- Encoding: standard base64 (with padding)

## Implementation

Jobber provides no verification SDK; use the standard library. Docs show Ruby and Node.js; the Python version below is equivalent.

### Node.js

```javascript
const crypto = require('crypto');

function verifyJobberSignature(rawBody, signatureHeader, clientSecret) {
  if (!signatureHeader || !clientSecret) return false;
  const expected = Buffer.from(
    crypto.createHmac('sha256', clientSecret).update(rawBody).digest('base64'), 'utf8');
  const received = Buffer.from(String(signatureHeader), 'utf8');
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(received, expected);
}
```

Jobber's own example calls `timingSafeEqual` without the length check, which throws on a length mismatch. Check lengths first. Don't decode the header with `Buffer.from(header, 'base64')`: lenient decoding ignores trailing junk.

### Python

```python
import hmac, hashlib, base64

def verify_jobber_signature(raw_body: bytes, signature_header: str | None, client_secret: str) -> bool:
    if not signature_header or not client_secret:
        return False
    expected = base64.b64encode(hmac.new(client_secret.encode(), raw_body, hashlib.sha256).digest())
    return hmac.compare_digest(signature_header.encode("utf-8"), expected)
```

`hmac.compare_digest` raises `TypeError` for non-ASCII `str` arguments, so encode both sides to bytes.

## Common Gotchas

- **Raw body**: verify the bytes as received. In Express use `express.raw({ type: '*/*' })` (not `express.json()`); in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Content type**: apps created before April 11, 2022 receive `application/x-www-form-urlencoded`. The signature still covers the raw body, so `type: '*/*'` verifies either way, but JSON parsing will fail for those apps.
- **Wrong secret**: the key is the OAuth *client secret*, not an access token or the client ID.
- **Header casing**: Node and FastAPI expose it lowercase: `x-jobber-hmac-sha256`.
- **Hookdeck**: if Hookdeck verifies the signature, it forwards the original body and headers unchanged, so you can still verify downstream.

## Debugging Verification Failures

- Compute the HMAC of the exact logged raw body with the client secret and compare it with the header.
- If lengths differ, the header may be truncated or you may be looking at a different app's webhook.
- If it matches in a script but not in your server, something parsed or re-serialized the body first.
- Rotated the client secret? Update `JOBBER_CLIENT_SECRET` (and the Hookdeck source).
