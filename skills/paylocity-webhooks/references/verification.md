# Paylocity Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Headers | `x-pcty-timestamp: <unix seconds>`, `x-pcty-signature: keyId=<uuid>:signature=<hex>[,...]` |
| Algorithm | HMAC-SHA256, lowercase hex |
| Key | The subscription key's secret, **base64-decoded** |
| Signed content | timestamp + `.` + raw body (UTF-8, not re-serialised) |
| Timestamp tolerance | Recommended: reject if more than 300 seconds off (optional in the examples) |

Paylocity's formula: `hex( HMAC-SHA256( base64Decode(secret), "{timestamp}.{rawBody}" ) )`.

## Node.js

```javascript
const crypto = require('crypto');

function decodeBase64Secret(secret) {
  const value = String(secret || '').trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;      // Node would skip bad characters
  const key = Buffer.from(value, 'base64');
  if (!key.length || key.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) return null;
  return key;
}

function verifyPaylocityWebhook(rawBody, signatureHeader, timestamp, secret, { toleranceSeconds = 0 } = {}) {
  const key = decodeBase64Secret(secret);
  if (!key || !signatureHeader || !timestamp) return false;
  if (toleranceSeconds > 0 && !(Math.abs(Date.now() / 1000 - Number(timestamp)) <= toleranceSeconds)) return false;
  const expected = crypto.createHmac('sha256', key).update(`${timestamp}.`).update(rawBody).digest();
  return signatureHeader.split(',').some((pair) => {
    const m = /^\s*keyId=([^:,\s]+):signature=((?:[0-9a-fA-F]{2})+)\s*$/.exec(pair);
    if (!m) return false;
    const given = Buffer.from(m[2], 'hex');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}
```

## Python

```python
import base64, hashlib, hmac, re, time

def verify_paylocity_webhook(raw_body: bytes, header: str, timestamp: str, secret: str, tolerance_seconds=0) -> bool:
    key = base64.b64decode(secret.strip(), validate=True)
    if not key or not header or not timestamp:
        return False
    if tolerance_seconds and abs(time.time() - float(timestamp)) > tolerance_seconds:
        return False
    expected = hmac.new(key, timestamp.encode() + b"." + raw_body, hashlib.sha256).digest()
    for part in header.split(","):
        m = re.fullmatch(r"\s*keyId=([^:,\s]+):signature=((?:[0-9a-fA-F]{2})+)\s*", part)
        if m and hmac.compare_digest(bytes.fromhex(m.group(2)), expected):
            return True
    return False
```

## Check Vector

Paylocity publishes no vector. This one uses two synthetic keys and the rotation form of the header:

| | |
|---|---|
| key1 secret | `6VYxrTi35LV17axsZ+L9bs/+RNu6M6T3bd6GYrToMf4=` |
| key2 secret | `iTkwcVdDt7tofILQTCR0G3Y3HulFNa8MqALLX9DRAYs=` |
| `x-pcty-timestamp` | `1700000000` |
| Body | `{"id":"evt_1","type":"test","data":{"a":1}}` |
| `x-pcty-signature` | `keyId=1b2c3d4e-0000-4000-8000-000000000001:signature=15276c12468d7d297cd6722ad59db1328f0d1c5e074c4faa5d4bde8a3877eeff,keyId=7e4a0000-0000-4000-8000-000000000002:signature=f10b4cfed0480f20b0bef9557ffb8d1708ab2e22e59aa3aaf38ad06b63945f5d` |

Either secret verifies this header.

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| Every request fails | The secret was used as text. Base64-decode it first |
| Every request fails, key decoded | The body was parsed and re-serialised. HMAC the raw bytes |
| Fails during rotation | You compared only the first pair. Try every `signature=` value |
| Fails only with the tolerance on | Server clock drift, or a retried delivery older than the window |
| Fails after rotation | Both keys expired, or the stored secret belongs to a deleted key |
