# Mindbody Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Header | `X-Mindbody-Signature` |
| Algorithm | HMAC-SHA256, base64 (44 characters), prefixed with `sha256=` |
| Key | The subscription's `messageSignatureKey`, as UTF-8 text |
| Signed content | The raw request body |
| Timestamp | None |

Mindbody's docs: "use the messageSignatureKey returned from the POST Subscription endpoint as the key for the algorithm. Prepend sha256= to the encoded signature. Compare the string with the header value." Its C# sample:

```csharp
using (var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(signatureKey)))
{
    var payload = actionContext.Request.Content.ReadAsStringAsync().Result;
    var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
    computedHash = $"sha256={Convert.ToBase64String(hash)}";
}
```

The prose calls the value "a UTF-8 encoded hash". The sample shows what that means: base64 text.

## Node.js

```javascript
const crypto = require('crypto');

function verifyMindbodySignature(rawBody, signature, messageSignatureKey) {
  const match = /^sha256=([A-Za-z0-9+/]{43}=)$/.exec(String(signature || '').trim());
  if (!messageSignatureKey || !match) return false;
  const expected = crypto.createHmac('sha256', messageSignatureKey).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'base64'), expected);
}
```

## Python

```python
import base64, hashlib, hmac, re

def verify_mindbody_signature(raw_body: bytes, signature: str, message_signature_key: str) -> bool:
    match = re.fullmatch(r"sha256=([A-Za-z0-9+/]{43}=)", (signature or "").strip())
    if not message_signature_key or not match:
        return False
    expected = hmac.new(message_signature_key.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64decode(match.group(1)), expected)
```

The C# sample compares strings with `!=`. The examples compare the decoded bytes in constant time.

## The HEAD Check

`HEAD` requests on subscription create (and on `PATCH`) have no body and no signature. Answer them with a 2xx and don't treat them as events.

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| Every request fails | The key was base64-decoded. Use the `messageSignatureKey` string as UTF-8 bytes |
| Every request fails, right key | The body was parsed and re-serialised. HMAC the raw bytes |
| Every request fails after re-creating the subscription | Each subscription has its own key. Use the key from the latest `POST` |
| Signature compares as different but looks the same | The `sha256=` prefix was kept on one side. Compare the base64 part only |
| Creating or patching the subscription fails with `invalidWebhookURLNoResponse` | The URL didn't return a 2xx to `HEAD` within the timeout |
