# Monnify Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Header | `monnify-signature` |
| Algorithm | HMAC-SHA512, lowercase hex (128 characters), no prefix |
| Key | The client secret key, as text |
| Signed content | The raw request body (compact JSON) |
| Timestamp | None |

## HMAC, Not Plain SHA-512

Monnify's prose says the hash is "SHA-512(client secret key + object of request body)". Its code samples don't do that:

- JavaScript: `sha512.hmac(clientSecret, stringifiedBody)` (js-sha512)
- PHP: `hash_hmac('sha512', $body, $clientSecret)`
- Java: `Mac.getInstance("HmacSHA512")`

The published sample hash reproduces with HMAC-SHA512 of the sample body and sample key, and not with plain SHA-512 of the key and body joined. Monnify's official .NET library (`Monnify/monnify-dotnet-lib`, `MonnifyWebhookValidator.cs`) states it outright: "HMAC-SHA512(key: secretKey, message: rawRequestBody)", lowercase hex, compared case-insensitively.

## Node.js

```javascript
const crypto = require('crypto');

function verifyMonnifySignature(rawBody, signature, clientSecret) {
  const value = String(signature || '').trim();
  if (!clientSecret || !/^[0-9a-fA-F]{128}$/.test(value)) return false;
  const expected = crypto.createHmac('sha512', clientSecret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'hex'), expected);
}
```

## Python

```python
import hashlib, hmac, re

def verify_monnify_signature(raw_body: bytes, signature: str, client_secret: str) -> bool:
    value = (signature or "").strip()
    if not client_secret or not re.fullmatch(r"[0-9a-fA-F]{128}", value):
        return False
    expected = hmac.new(client_secret.encode("utf-8"), raw_body, hashlib.sha512).digest()
    return hmac.compare_digest(bytes.fromhex(value), expected)
```

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| No `monnify-signature` header | It's a sandbox delivery. The sandbox doesn't sign |
| Every request fails | You hashed `secret + body` with plain SHA-512. Use HMAC-SHA512 |
| Every request fails, HMAC | The body was parsed and re-serialised (or pretty-printed). HMAC the raw bytes |
| Every request fails, raw body | You used the API key instead of the client secret key |
