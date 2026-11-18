# Outseta Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Header | `x-hub-signature-256: sha256=<hex>` |
| Algorithm | HMAC-SHA256, hex |
| Key | The Webhook Signature Key, **hex-decoded** (32 bytes) |
| Signed content | The raw body as UTF-8 bytes |
| Timestamp | None |

Outseta's steps: get the raw body as a string, convert it from UTF-8 to bytes, decode the key from hex to bytes, compute the HMAC, then "Compare the calculated HMAC Hex with an added `sha256=` with the one sent in the `x-hub-signature-256` header". Its Node sample:

```javascript
const key = Buffer.from(keyAsHex, "hex");
// ... createHmac("sha256", key) over the body, digest("hex")
return signature === "sha256=" + calculatedSignature;
```

Use a constant-time comparison instead of `===`, as the examples do.

## The Hex Key Trap

A 64-character hex string uses only characters that are also valid base64, and 64 is a multiple of 4, so base64-decoding it succeeds and returns **48** bytes that aren't the key. Every request then fails with no hint why. Decode the key as hex.

## Node.js

```javascript
const crypto = require('crypto');

function decodeHexSecret(secret) {
  const value = String(secret || '').trim();
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(value)) return null;   // Node's hex decoder stops at a bad character
  return Buffer.from(value, 'hex');
}

function verifyOutsetaWebhook(rawBody, signature, signatureKey) {
  const key = decodeHexSecret(signatureKey);
  const match = /^sha256=((?:[0-9a-fA-F]{2})+)$/.exec(String(signature || '').trim());
  if (!key || !match) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  const given = Buffer.from(match[1], 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
```

## Python

```python
import hashlib, hmac, re

def verify_outseta_webhook(raw_body: bytes, signature: str, signature_key: str) -> bool:
    key = bytes.fromhex(signature_key.strip())
    match = re.fullmatch(r"sha256=((?:[0-9a-fA-F]{2})+)", (signature or "").strip())
    if not match:
        return False
    expected = hmac.new(key, raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(match.group(1)), expected)
```

## Check Vector

Outseta publishes none. This one uses a synthetic key:

| | |
|---|---|
| Key | `587f17dc2d218994867047c65133e38fc10c94f664fdc3c78370c49c0bf1a480` |
| Body | `{"id":"evt_1","type":"test","data":{"a":1}}` |
| `x-hub-signature-256` | `sha256=1ed97849266847e37b36371bba32e3d8013a5cd0a9abcd59c52441be43da18ba` |

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| No `x-hub-signature-256` header | No Webhook Signature Key is configured in Outseta |
| Every request fails | The key was used as text, or decoded as base64. Hex-decode it |
| Wrong key length | Outseta requires 32 bytes written as hex (64 characters) |
| Every request fails, key decoded | The body was parsed and re-serialised; HMAC the raw bytes |
| Fails after changing the key | The key differs between Outseta and your server (or Hookdeck) |
