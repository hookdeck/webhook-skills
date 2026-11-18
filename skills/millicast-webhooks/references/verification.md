# Dolby OptiView Real-time (Millicast) Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Header | `x-millicast-signature: sha1=<hex>` |
| Algorithm | HMAC-**SHA1**, hex |
| Key | The Webhook Secret, **base64-decoded** |
| Signed content | The raw request body (JSON, or JPEG bytes for thumbnails) |
| Timestamp | Not signed; `timestamp` in the JSON and `x-millicast-timestamp` are informational |

Dolby's sample (Node.js):

```javascript
const webhookSecretBuffer = Buffer.from(webhookSecret, 'base64');
const calculatedSignature = 'sha1=' + Crypto.createHmac('sha1', webhookSecretBuffer).update(body).digest('hex');
if (calculatedSignature !== headerSignature) {
  res.status(400).send('BAD SIGNATURE');
}
```

The official [samples repository](https://github.com/millicast/samples-millicast-webhooks) hashes `Buffer.concat(chunks)` (the raw bytes) for both JSON and JPEG bodies.

## Binary Bodies

A JPEG isn't valid UTF-8. If your framework decodes the body to a string and you hash that string, the replacement characters change the bytes and the signature never matches. Keep the body as bytes:

- Express: `express.raw({ type: '*/*', limit: '10mb' })`
- Next.js: `Buffer.from(await request.arrayBuffer())`
- FastAPI: `await request.body()`

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

function verifyMillicastWebhook(rawBody, signature, secret) {
  const key = decodeBase64Secret(secret);
  const match = /^sha1=((?:[0-9a-fA-F]{2})+)$/.exec(String(signature || '').trim());
  if (!key || !match) return false;
  const expected = crypto.createHmac('sha1', key).update(rawBody).digest();
  const given = Buffer.from(match[1], 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
```

## Python

```python
import base64, hashlib, hmac, re

def verify_millicast_webhook(raw_body: bytes, signature: str, secret: str) -> bool:
    key = base64.b64decode(secret.strip(), validate=True)
    match = re.fullmatch(r"sha1=((?:[0-9a-fA-F]{2})+)", (signature or "").strip())
    if not key or not match:
        return False
    expected = hmac.new(key, raw_body, hashlib.sha1).digest()
    return hmac.compare_digest(bytes.fromhex(match.group(1)), expected)
```

## Check Vectors

Millicast publishes none. These use a synthetic secret, `10ipEMzmyDx7MyTJS7uQrbkyuvpL38y7mLV9Uv8uolg=`:

| Body | `x-millicast-signature` |
|---|---|
| `{"id":"evt_1","type":"test","data":{"a":1}}` | `sha1=b021d0d11fdbdb96f07e548a06461ada81c78152` |
| Bytes `ff d8 ff e0 00 10`, `JFIF\0`, bytes `00`..`ff`, `ff d9` (269 bytes) | `sha1=c2194e698535f850aaf0756f51569f6ba4b6818c` |

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| Every request fails | The secret was used as text. Base64-decode it first |
| JSON verifies, thumbnails don't | The JPEG was decoded to a string, or truncated by a body-size limit |
| Every request fails, key decoded | The body was parsed and re-serialised |
| Fails after renewing | The renewed secret isn't deployed yet; renewal takes effect at once |
