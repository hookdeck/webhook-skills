# Authorize.net Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Header | `X-ANET-Signature` |
| Value | `sha512=` + uppercase hex HMAC-SHA512 (128 characters) |
| Key | The Signature Key, as text |
| Signed content | The raw request body |
| Timestamp | None |

The docs describe the hash ("HMAC-SHA512, with the body of the webhook notification and the merchant's Signature Key") but don't print a sample header. Deliveries look like `sha512=7A3C...`, uppercase.

## The Key Is Text

A Signature Key is 128 hex characters. Authorize.net's `transHashSHA2` (transaction response hash) hex-decodes it before use. Webhooks use the key string directly. If verification always fails and you are decoding the key, stop decoding it.

## Node.js

```javascript
const crypto = require('crypto');

function verifyAuthorizeNetSignature(rawBody, signature, signatureKey) {
  const match = /^sha512=([0-9a-fA-F]{128})$/i.exec(String(signature || '').trim());
  if (!signatureKey || !match) return false;
  const expected = crypto.createHmac('sha512', signatureKey).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'hex'), expected);
}
```

## Python

```python
import hashlib, hmac, re

def verify_authorize_net_signature(raw_body: bytes, signature: str, signature_key: str) -> bool:
    match = re.fullmatch(r"sha512=([0-9a-fA-F]{128})", (signature or "").strip(), re.IGNORECASE)
    if not signature_key or not match:
        return False
    expected = hmac.new(signature_key.encode("utf-8"), raw_body, hashlib.sha512).digest()
    return hmac.compare_digest(bytes.fromhex(match.group(1)), expected)
```

Comparing decoded bytes makes the comparison case-insensitive. If you compare strings instead, uppercase your digest first.

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| Every request fails | The Signature Key was hex-decoded. Use it as text |
| Every request fails, key as text | You compared lowercase hex to the uppercase header as strings |
| Every request fails | `sha512=` left on the value before comparing |
| Every request fails | The body was parsed and re-serialised. HMAC the raw bytes |
| Started failing after a change | A new Signature Key was generated. Notifications are signed with the newest key |
