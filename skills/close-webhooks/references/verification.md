# Close Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Headers | `close-sig-timestamp: <unix seconds>`, `close-sig-hash: <hex>` |
| Algorithm | HMAC-SHA256, lowercase hex |
| Key | The subscription's `signature_key`, **hex-decoded** (32 bytes) |
| Signed content | timestamp + raw body, **no delimiter** |
| Timestamp tolerance | None documented |

Close's sample (Python 3):

```python
key = '058bfb6a3d8cfdc4da7c3be5901b16ae11da982b46a25fb2cd7016e97a140a1c'
data = headers['close-sig-timestamp'] + payload
signature = hmac.new(bytearray.fromhex(key), data.encode('utf-8'), hashlib.sha256).hexdigest()
valid = hmac.compare_digest(headers['close-sig-hash'], signature)
```

## The Hex Key Trap

A 64-character hex string uses only characters that are also valid base64, and 64 is a multiple of 4, so `Buffer.from(key, 'base64')` or `base64.b64decode(key)` decodes it without error to **48** bytes that aren't the key. Every request then fails with no hint why. Decode Close's key as hex.

## Node.js

```javascript
const crypto = require('crypto');

function decodeHexSecret(secret) {
  const value = String(secret || '').trim();
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(value)) return null;   // Node's hex decoder stops at a bad character
  return Buffer.from(value, 'hex');
}

function verifyCloseWebhook(rawBody, sigHash, timestamp, signatureKey) {
  const key = decodeHexSecret(signatureKey);
  const given = String(sigHash || '').trim();
  if (!key || !timestamp || !/^(?:[0-9a-fA-F]{2})+$/.test(given)) return false;
  const expected = crypto.createHmac('sha256', key).update(timestamp).update(rawBody).digest();
  const bytes = Buffer.from(given, 'hex');
  return bytes.length === expected.length && crypto.timingSafeEqual(bytes, expected);
}
```

## Python

```python
import hashlib, hmac

def verify_close_webhook(raw_body: bytes, sig_hash: str, timestamp: str, signature_key: str) -> bool:
    key = bytes.fromhex(signature_key.strip())
    expected = hmac.new(key, timestamp.encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, (sig_hash or "").strip().lower())
```

## Check Vector

Close's page shows a sample key, timestamp and hash, but not the payload, so the sample hash can't be reproduced. This vector uses the sample key and timestamp with a fixed body:

| | |
|---|---|
| `signature_key` | `058bfb6a3d8cfdc4da7c3be5901b16ae11da982b46a25fb2cd7016e97a140a1c` (Close's sample) |
| `close-sig-timestamp` | `1544271440` |
| Body | `{"id":"evt_1","type":"test","data":{"a":1}}` |
| `close-sig-hash` | `80aef193499f656f34626d9beb748f6eeddd96f6af433706d201746f83fe6ba4` |

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| Every request fails | The key was used as text, or decoded as base64. Hex-decode it |
| Every request fails, key decoded | A `.` or other delimiter was added between timestamp and body |
| Every request fails, raw body | The body was parsed and re-serialised; HMAC the raw bytes |
| Fails for one subscription only | Each subscription has its own `signature_key` |
