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
- **Same scheme for both formats**: it applies to the CloudEvents payload and the legacy `eventNotifications` payload, with the same Verifier Token. Live test deliveries of both formats in November 2026 verified this way, and failed with a wrong key.

Headers of a real legacy delivery (November 2026):

```
content-type: application/json; charset=utf-8
intuit-created-time: 2026-11-18T16:08:23.921Z
intuit-notification-schema-version: 1.0
intuit-signature: w5OMDcJlwfu999hkwBzzaaUE5aHXHQc06NpltIG+ZNs=
intuit-t-id: a91ada21-2910-415c-8602-4673d92fb5e0
user-agent: intuit_notification_server/1.0
```

Headers of a real CloudEvents delivery. It adds `intuit-signature-algorithm` and `intuit-signature-id`; neither changes how you verify:

```
content-type: application/cloudevents-batch+json; charset=utf-8
intuit-created-time: 2026-11-18T16:10:07.602Z
intuit-notification-schema-version: 2.0
intuit-signature: d/mSzRAsJ+Zb8Dos20+v7GCNX3NdJppjTcU1s9CYvvU=
intuit-signature-algorithm: HMAC-SHA256
intuit-signature-id: 9bc559d3-553d-4d9b-a63b-91e0f5f79a1a
intuit-t-id: 5df05f6a-218a-4688-8238-bf295d272f73
user-agent: intuit_notification_server/1.0
```

## Implementation

### SDK Verification

Intuit's Java SDK verifies with `WebhooksService.verifyPayload(intuitSignature, payload)`, which reads the verifier token from its config. The Node and Python OAuth clients have no webhook-signature helper, and Intuit's docs sample verifies by hand, so all examples here do too.

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
- **Content type.** CloudEvents deliveries arrive as `application/cloudevents-batch+json; charset=utf-8`, not `application/json` (Intuit's migration guide says `application/cloudevents+json`, which is also not what was sent). Match every content type when reading the raw body (`express.raw({ type: '*/*' })`); a matcher that misses leaves `req.body` empty and every request fails verification.
- **Body-size limits.** Intuit sets no size limit, and big batches can exceed small server defaults. A truncated body fails verification.
- **Rejections stall delivery.** Intuit retries non-2xx responses and may hold back later events until the first is acknowledged. A broken verifier stops the whole stream, not just one event.
- **Array, not object.** CloudEvents payloads are a top-level JSON **array**, even with one event. Code that reads `body.eventNotifications` only sees the legacy shape, and code that reads `body.type` gets `undefined`.

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
