# Employment Hero Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Headers | `X-EmploymentHero-Timestamp`, `X-EmploymentHero-Signature` |
| Algorithm | HMAC-SHA256, standard base64 with padding |
| Key | The webhook's secret key, **base64-decoded** |
| Signed content | timestamp + `.` + raw JSON body |
| Timestamp tolerance | None documented |

Employment Hero's Ruby sample:

```ruby
def verify_signature(secret_string, timestamp, payload, signature)
  data = "#{timestamp}.#{payload}"
  secret = Base64.decode64(secret_string)
  digest = OpenSSL::HMAC.digest('SHA256', secret, data)
  expected_signature = Base64.strict_encode64(digest)
  ActiveSupport::SecurityUtils.secure_compare(expected_signature, signature)
end
```

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

function verifyEmploymentHeroWebhook(rawBody, signature, timestamp, secret) {
  const key = decodeBase64Secret(secret);
  if (!key || !signature || !timestamp) return false;
  const expected = crypto.createHmac('sha256', key).update(`${timestamp}.`).update(rawBody).digest('base64');
  const a = Buffer.from(signature.trim()), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

## Python

```python
import base64, hashlib, hmac

def verify_employment_hero_webhook(raw_body: bytes, signature: str, timestamp: str, secret: str) -> bool:
    key = base64.b64decode(secret.strip(), validate=True)
    if not key or not signature or not timestamp:
        return False
    digest = hmac.new(key, timestamp.encode() + b"." + raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(signature.strip().encode(), base64.b64encode(digest))
```

## Check Vector

Employment Hero publishes no vector. This one uses a synthetic secret:

| | |
|---|---|
| Secret key | `s3y0VT/1knFo5q9JnXJCjQHyPt8GfhmYkcS8lNF3D/Q=` |
| `X-EmploymentHero-Timestamp` | `1700000000` |
| Body | `{"id":"evt_1","type":"test","data":{"a":1}}` |
| `X-EmploymentHero-Signature` | `y/dPUVP8svSzwTMHHftIu7AnRoLSZxFwdD8iK1MWLEY=` |

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| Every request fails | The secret key was used as text. Base64-decode it first |
| Every request fails, key decoded | The body was parsed and re-serialised. HMAC the raw bytes |
| Every request fails, raw body | The `.` between timestamp and body is missing, or the digest is hex instead of base64 |
| Works in Ruby, not here | Ruby's `decode64` ignores stray characters; the examples reject them. Copy the key again |
