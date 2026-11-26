# Samsara Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Headers | `X-Samsara-Timestamp: <unix seconds>`, `X-Samsara-Signature: v1=<hex>` |
| Algorithm | HMAC-SHA256, lowercase hex |
| Key | The webhook's secret key, **base64-decoded** |
| Signed content | `v1:` + timestamp + `:` + raw body |
| Timestamp tolerance | None documented |

Samsara's docs: "The secret key displayed on the webhook configuration page is Base64 encoded. It must be decoded before use with the HMAC SHA-256 algorithm." And: "`v1` is the only current signature version. Any other prefix to the signature indicates the request is not coming from Samsara."

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

function verifySamsaraWebhook(rawBody, signature, timestamp, secret) {
  const key = decodeBase64Secret(secret);
  if (!key || !signature || !timestamp) return false;
  const match = /^v1=((?:[0-9a-fA-F]{2})+)$/.exec(signature.trim());
  if (!match) return false;
  const expected = crypto.createHmac('sha256', key).update(`v1:${timestamp}:`).update(rawBody).digest();
  const given = Buffer.from(match[1], 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
```

Read the raw body: `express.raw({ type: '*/*' })` in Express, `Buffer.from(await request.arrayBuffer())` in Next.js.

## Python

```python
import base64, hashlib, hmac, re

def verify_samsara_webhook(raw_body: bytes, signature: str, timestamp: str, secret: str) -> bool:
    key = base64.b64decode(secret.strip(), validate=True)
    match = re.fullmatch(r"v1=((?:[0-9a-fA-F]{2})+)", (signature or "").strip())
    if not key or not match or not timestamp:
        return False
    expected = hmac.new(key, b"v1:" + timestamp.encode() + b":" + raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(match.group(1)), expected)
```

`validate=True` raises on characters outside the base64 alphabet; catch `binascii.Error` and treat it as a configuration error. The FastAPI example does that and also checks the encoding is canonical.

## Check Vector

Samsara's page shows a sample secret and, separately, a sample request, but the sample request doesn't verify with the sample secret, so it isn't usable as a test vector. This one uses the sample secret:

| | |
|---|---|
| Secret key | `rGoy+beNph0qGBLj6Aqoydj6SGA=` (Samsara's sample, 20 bytes decoded) |
| `X-Samsara-Timestamp` | `1587597109` |
| Body | `{"id":"evt_1","type":"test","data":{"a":1}}` |
| `X-Samsara-Signature` | `v1=1a2489e57b7e943fbdf5068de365a580265f81dc81eee464b8e4f0491bafc0d3` |

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| Every request fails | The secret key was used as text. Base64-decode it first |
| Every request fails, key decoded | The body was parsed and re-serialised. HMAC the raw bytes |
| Every request fails, raw body | The signed string is missing the `v1:` prefix or a colon, or uses the wrong timestamp header |
| Comparison always false | You compared `v1=<hex>` with the bare hex, or compared hex with raw bytes |
| Fails after rotating | The new secret key isn't deployed yet |

## Replay Protection

Samsara documents no timestamp window. If you add one, keep it generous, because retries back off exponentially, and rely on `eventId` to drop duplicates.
