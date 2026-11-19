# Juniper Mist Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Header | `X-Mist-Signature-v2` |
| Algorithm | HMAC-SHA256, lowercase hex (64 characters), no prefix |
| Key | The webhook's Secret, as UTF-8 text |
| Signed content | The raw request body |
| Timestamp | None |
| Legacy | `X-Mist-Signature`: HMAC-SHA1, hex (40 characters), same key and body |

Mist's docs: "When a secret is provided, two HTTP headers will be added: X-Mist-Signature: HMAC_SHA1 (secret, body) X-Mist-Signature-v2: HMAC_SHA256 (secret, body)". The Mist OpenAPI spec repeats this and says it applies "Only if `type`=`http-post`".

## Why Hex

The docs don't name the encoding. Receivers that verify live Mist headers use hex:

- [mwtt](https://github.com/tmunzer/mwtt), a Mist webhook test tool by a Juniper Mist engineer: `hmac.new(key, req.data, hashlib.sha256).hexdigest()` compared with `X-Mist-Signature-v2`.
- The [PlaceOS Juniper Mist driver](https://github.com/PlaceOS/drivers/blob/HEAD/drivers/juniper/mist.cr): `OpenSSL::HMAC.hexdigest(SHA256, secret, body)` for v2, with a SHA-1 fallback for `X-Mist-Signature`.

## Node.js

```javascript
const crypto = require('crypto');

function verifyMistSignature(rawBody, signature, secret) {
  const value = String(signature || '').trim();
  if (!secret || !/^[0-9a-fA-F]{64}$/.test(value)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'hex'), expected);
}
```

## Python

```python
import hashlib, hmac, re

def verify_mist_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    value = (signature or "").strip()
    if not secret or not re.fullmatch(r"[0-9a-fA-F]{64}", value):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(value), expected)
```

## v1

`X-Mist-Signature` uses SHA-1. Mist sends both headers, so there's no reason to fall back to v1. If you must, use `hashlib.sha1` / `createHmac('sha1', ...)` and a 40-character hex check, and only when v2 is absent.

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| No signature headers | The webhook has no Secret, or isn't type HTTP Post |
| Every request fails | The body was parsed and re-serialised. HMAC the raw bytes |
| Every request fails, raw body | You're comparing against `X-Mist-Signature` (SHA-1) with a SHA-256 digest, or the other way round |
| `X-Mist-Error` header present | Your custom headers are invalid, too big (over 1000 bytes) or not strings |
