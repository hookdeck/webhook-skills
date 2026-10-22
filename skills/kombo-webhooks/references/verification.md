# How to Verify Kombo Webhook Signatures

## How It Works

Kombo signs each request with your **Kombo Webhook Secret**:

| Item | Value |
|------|-------|
| Header | `X-Kombo-Signature` |
| Algorithm | HMAC-SHA256 |
| Signed content | The raw JSON request body (Kombo encodes it with two-space indentation) |
| Key | The secret's UTF-8 bytes (not base64-decoded) |
| Header encoding | base64url **without padding** |
| Comparison | Encode the HMAC as unpadded base64url, compare with the header text in constant time |

There is no timestamp and no SDK helper for verification.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyKomboWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64url');
  const provided = Buffer.from(signatureHeader.replace(/=+$/, ''));
  return provided.length === expected.length && crypto.timingSafeEqual(provided, Buffer.from(expected));
}
```

Express: `app.post('/webhooks/kombo', express.raw({ type: '*/*' }), handler)`.
Next.js App Router: `await request.text()`.

### Python

```python
import base64, hashlib, hmac

def verify_kombo_webhook(raw_body: bytes, signature_header: "str | None", secret: str) -> bool:
    if not signature_header:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    # Compare base64url text (Kombo strips the padding) so trailing junk can't decode to a match
    expected_b64 = base64.urlsafe_b64encode(expected).rstrip(b"=")
    return hmac.compare_digest(signature_header.rstrip("=").encode(), expected_b64)
```

FastAPI: `await request.body()`.

## Common Gotchas

- **Raw body only.** If a framework already parsed the JSON, `JSON.stringify(body)` won't match. Kombo's docs say that if you must re-encode, use two-space indentation (`JSON.stringify(body, null, 2)`), but reading the raw bytes is safer.
- **Compare base64url text, don't decode the header.** Decoders skip invalid characters, so a valid digest with junk appended or inserted would still match. Encode your HMAC with the base64url alphabet (`-`/`_`, not `+`/`/`) and strip `=` padding from both sides before comparing.
- **Secret is not decoded.** Use the dashboard string as-is, as UTF-8 bytes.
- **Correct environment.** Production and development have different secrets.
- **Any content type.** In Express use `express.raw({ type: '*/*' })` so a different `Content-Type` doesn't skip the raw parser.
- **Status codes.** Return 400 for a bad signature. Kombo doesn't retry 4xx. Return 5xx only for your own failures so Kombo retries.

## Debugging Verification Failures

1. Log the body length and compare with what Kombo's dashboard shows for the test request
2. Confirm `KOMBO_WEBHOOK_SECRET` belongs to the same Kombo environment
3. Check no proxy, middleware or tunnel rewrote the body (pretty-printing, charset changes)
4. Confirm you encode your HMAC as `base64url` (not standard base64) without padding
5. Use the dashboard's test-request button to get a freshly signed payload
