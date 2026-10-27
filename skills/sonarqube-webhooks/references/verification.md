# How to Verify SonarQube Webhook Signatures

## How It Works

When a webhook has a Secret, SonarQube sends:

```
X-Sonar-Webhook-HMAC-SHA256: <hex>
```

The value is the **bare lowercase hex** HMAC-SHA256 of the **raw request body**, keyed with the webhook Secret. SonarQube's own Java sample is `new HmacUtils(HmacAlgorithms.HMAC_SHA_256, "your_secret").hmacHex(request.getBody())`.

- Signed content: the raw body bytes only. No timestamp, id or other header is signed.
- Key: the Secret's UTF-8 bytes, used as-is.
- Header: the whole value is one digest. No prefix, no list splitting.
- There is no timestamp, so there is no replay window to check.
- If the webhook has no Secret, the header is absent and deliveries are unsigned. **Set a secret on the SonarQube webhook. Without one, deliveries are unsigned and fail verification.**

## Implementation

Node.js:

```javascript
const crypto = require('crypto');

function verifySonarQubeSignature(rawBody, signature, secret) {
  // Check shape first: Buffer.from(x, 'hex') silently drops invalid characters
  if (!signature || !secret || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature.toLowerCase()));
}
```

Python:

```python
import hashlib, hmac, re

def verify_sonarqube_signature(raw_body: bytes, signature, secret) -> bool:
    if not signature or not secret or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Encode both sides: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(expected.encode(), signature.lower().encode())
```

SonarQube provides no SDK for receivers, so verification is manual.

## Common Gotchas

- **Raw body.** Read bytes (`express.raw({ type: '*/*' })`, `await request.arrayBuffer()`, `await request.body()`). Never `JSON.parse`/`JSON.stringify` before verifying.
- **No Secret, no header.** A webhook without a Secret sends unsigned deliveries.
- **Hex case.** Compare case-insensitively: lowercase both sides after checking exactly 64 hex characters.
- **Secret as text.** Do not hex- or base64-decode the Secret.
- **Reverse proxies.** A proxy that rewrites the body (re-compression, re-encoding) breaks the signature.

## Debugging Verification Failures

1. Header missing: the webhook has no Secret. Add one and save.
2. Mismatch: confirm `SONARQUBE_WEBHOOK_SECRET` equals the Secret saved on this exact webhook (project and global webhooks each have their own).
3. Still failing: log the raw body length and compare it with the request in SonarQube's delivery log, looking for body mangling by middleware.
