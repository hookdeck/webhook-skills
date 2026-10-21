# How to Verify QuickBooks Webhook Signatures

## How Does QuickBooks Signature Verification Work?

Intuit signs every webhook notification as follows:

1. Take the **raw request body** exactly as sent.
2. Compute **HMAC-SHA256** over it, using your app's **Verifier Token** as the key.
3. **Base64**-encode the digest.
4. Send the result in the **`intuit-signature`** header.

To verify, recompute the same value and compare it with the header using a **timing-safe** comparison.

- **No timestamp or ID** is signed, so it's not Standard Webhooks.
- **No secret prefix or decoding**: use the Verifier Token as a UTF-8 string key.
- **Same scheme for both formats**: it applies to the CloudEvents payload and the legacy `eventNotifications` payload.

Example headers:

```
content-type: application/json; charset=utf-8
intuit-signature: 6kQBQtjwjupelRMwkyJsnpq80uhz2o+Rn92+m03GhKE=
intuit-t-id: 9cf50b60-8b0e-4fea-8327-e6a66099fe6f
intuit-created-time: 2016-02-02T16:25:00-0800
user-agent: intuit_notification_server/0.1
```

## Implementation

### SDK Verification

Intuit's SDKs (`intuit-oauth` for Node, `intuit-oauth` / `python-quickbooks` for Python, the Java and .NET SDKs) have **no** webhook-signature helper. Intuit's own sample verifies by hand, so all examples here do too.

### Manual Verification

**Node.js (Express / Next.js)**

```javascript
const crypto = require('crypto');

function verifyQuickBooksSignature(rawBody, signature, verifierToken) {
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', verifierToken)
    .update(rawBody) // Buffer or string. Must be the unparsed body.
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // different lengths = invalid
  }
}
```

**Python (FastAPI)**

```python
import base64
import hashlib
import hmac
from typing import Optional

def verify_quickbooks_signature(raw_body: bytes, signature: Optional[str], verifier_token: str) -> bool:
    if not signature:
        return False
    expected = base64.b64encode(
        hmac.new(verifier_token.encode("utf-8"), raw_body, hashlib.sha256).digest()
    )
    return hmac.compare_digest(signature.encode("utf-8"), expected)
```

Comparing bytes avoids the `TypeError` that `hmac.compare_digest` raises on non-ASCII `str` input.

**Intuit's Java reference** (from the docs, shortened):

```java
SecretKeySpec key = new SecretKeySpec(verifier.getBytes("UTF-8"), "HmacSHA256");
Mac mac = Mac.getInstance("HmacSHA256");
mac.init(key);
String hash = Base64.getEncoder().encodeToString(mac.doFinal(payload.getBytes()));
return hash.equals(headers.get("intuit-signature"));
```

## Common Gotchas

- **Raw body only.** Parsing the JSON and re-serializing it changes whitespace and key order, so the HMAC won't match. Use `express.raw()`, `await request.text()` in Next.js, or `await request.body()` in FastAPI.
- **Base64, not hex.** Compare against `digest('base64')`, not `digest('hex')`.
- **Wrong environment token.** Development and Production have different Verifier Tokens. A sandbox token fails every production delivery.
- **Header case.** The header is `intuit-signature`. Node and FastAPI lowercase incoming header names; Next.js `headers.get()` doesn't care about case.
- **Content type.** Intuit doesn't document the `Content-Type` of CloudEvents deliveries, and it may not be `application/json`. Match every content type when reading the raw body (`express.raw({ type: '*/*' })`); a matcher that misses leaves `req.body` empty and every request fails verification.
- **Body-size limits.** Intuit sets no size limit, and big batches can exceed small server defaults. A truncated body fails verification.
- **Rejections stall delivery.** Intuit retries non-2xx responses and may hold back later events until the first is acknowledged. A broken verifier stops the whole stream, not just one event.
- **Array, not object.** CloudEvents payloads are a top-level JSON **array**. Code that reads `body.eventNotifications` only sees the legacy shape.

## Debugging Verification Failures

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Every request fails | Wrong Verifier Token, or Development vs Production mixed up | Copy the token from the matching tab in the app's **Webhooks** page |
| Every request fails, token is right | Body parsed before verification | Read the raw bytes before any JSON middleware |
| Fails only on large batches | Body truncated by a size limit | Raise the server's body limit |
| Header missing | Request didn't come from Intuit, or a proxy dropped it | Check proxy header forwarding. Inspect requests in the Hookdeck CLI web UI |
| `TypeError` in Python | Non-ASCII `str` passed to `compare_digest` | Compare bytes, as above |

To check your setup, compute the expected signature for a captured body and compare it with the header:

```bash
printf '%s' "$RAW_BODY" | openssl dgst -sha256 -hmac "$QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN" -binary | base64
```
