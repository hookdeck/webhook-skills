# FedEx Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Header | `fdx-signature` |
| Algorithm | HMAC-SHA256, base64 (44 characters), no prefix |
| Key | The security token, as text |
| Signed content | The request payload, as sent |
| Timestamp | None |

FedEx's business rules page:

> FedEx Advanced Integrated Visibility webhook will use HMAC SHA256. SHA256( security token + payload) = Base 64 encoded fdx-signature

```java
Mac mac = Mac.getInstance("HmacSHA256");
mac.init(new SecretKeySpec(secureToken.getBytes(), "HmacSHA256"));
return new String(Base 64 encoded(mac.doFinal(payLoad.getBytes())));
```

"The secret key used is the secure token that you will provide when setting up the Advanced Integrated Visibility or when testing the Advanced Integrated Visibility URL."

## The Hex Sentence

The same page also says "finalize the MAC operation by hex encoding the request payload sent by FedEx." That contradicts the formula and the code next to it, and FedEx's FAQ ("HMAC based base64 encoded fdx-signature"). Every public receiver uses base64. Treat the sentence as an editing error.

## Node.js

```javascript
const crypto = require('crypto');

function verifyFedExSignature(rawBody, signature, securityToken) {
  const value = String(signature || '').trim();
  if (!securityToken || !/^[A-Za-z0-9+/]{43}=$/.test(value)) return false;
  const expected = crypto.createHmac('sha256', securityToken).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'base64'), expected);
}
```

## Python

```python
import base64, hashlib, hmac, re

def verify_fedex_signature(raw_body: bytes, signature: str, security_token: str) -> bool:
    value = (signature or "").strip()
    if not security_token or not re.fullmatch(r"[A-Za-z0-9+/]{43}=", value):
        return False
    expected = hmac.new(security_token.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64decode(value), expected)
```

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| Every request fails | You compared a hex digest. Use base64 |
| Every request fails, base64 | The body was parsed and re-serialised. HMAC the raw bytes |
| "Try this webhook" fails but real deliveries work (or the reverse) | Different security tokens were used for the test and the webhook project |
| Creating the webhook fails | The URL validation got something other than `200` or `202`. Check your logs for a `401` from this handler |
