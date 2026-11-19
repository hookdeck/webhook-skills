# Klarna Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Header | `Klarna-Signature` |
| Algorithm | HMAC-SHA256, lowercase hex (64 characters), no prefix |
| Key | The `signing_key` from createSigningKey, as UTF-8 text |
| Key ID header | `Klarna-Signing-Key-Id` |
| Signed content | The raw request body |
| Timestamp | None |

Klarna's steps: compute the signature over "the raw JSON sent in the HTTP request body" with the key named by `Klarna-Signing-Key-Id`, encode it "as lowercase hexadecimal (64 characters). Do not use Base64", compare it with `Klarna-Signature`, and reject mismatches.

Klarna's own SAP Commerce plugin (`klarna/SAP-Commerce-klarna-payments`, `KlarnaValidationUtil.java`) uses `new SecretKeySpec(savedSigningKey.getBytes(StandardCharsets.UTF_8), "HmacSHA256")` and `Hex.encodeHexString` over the raw request bytes, which settles the key format.

## Node.js

```javascript
const crypto = require('crypto');

function verifyKlarnaSignature(rawBody, signature, signingKey) {
  const value = String(signature || '').trim();
  if (!signingKey || !/^[0-9a-fA-F]{64}$/.test(value)) return false;
  const expected = crypto.createHmac('sha256', signingKey).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'hex'), expected);
}
```

## Several Keys

During a rotation, keep a map of key ID to key and pick by header:

```javascript
const keys = { [process.env.KLARNA_SIGNING_KEY_ID]: process.env.KLARNA_SIGNING_KEY /* , oldId: oldKey */ };
const key = keys[req.get('klarna-signing-key-id')];
const ok = Boolean(key) && verifyKlarnaSignature(rawBody, req.get('klarna-signature'), key);
```

## Python

```python
import hashlib, hmac, re

def verify_klarna_signature(raw_body: bytes, signature: str, signing_key: str) -> bool:
    value = (signature or "").strip()
    if not signing_key or not re.fullmatch(r"[0-9a-fA-F]{64}", value):
        return False
    expected = hmac.new(signing_key.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(value), expected)
```

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| Every request fails | The body was parsed and re-serialised. HMAC the raw bytes |
| Every request fails, raw body | You compared base64. Klarna sends lowercase hex |
| Some requests fail after a key change | They're signed with the other key. Check `Klarna-Signing-Key-Id` |
| Nothing arrives | The endpoint isn't on port 443 or 8443 |
