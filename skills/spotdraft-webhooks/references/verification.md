# SpotDraft Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Header | `X-SD-WEBHOOK-CONTENT-HASH: <hex>` |
| Algorithm | HMAC-**SHA512**, hex (128 characters) |
| Key | The `hmac_key` from the API, **base64-decoded** |
| Signed content | The raw request body |
| Timestamp | None |

SpotDraft's sample:

```python
def verify_spotdraft_webhook(raw_body: bytes, received_hash: str, hmac_key: str) -> bool:
    computed_hash = hmac.new(base64.b64decode(hmac_key), raw_body, digestmod=hashlib.sha512).hexdigest()
    return hmac.compare_digest(computed_hash, received_hash)
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

function verifySpotDraftWebhook(rawBody, contentHash, hmacKey) {
  const key = decodeBase64Secret(hmacKey);
  const given = String(contentHash || '').trim();
  if (!key || !/^(?:[0-9a-fA-F]{2})+$/.test(given)) return false;
  const expected = crypto.createHmac('sha512', key).update(rawBody).digest();
  const bytes = Buffer.from(given, 'hex');
  return bytes.length === expected.length && crypto.timingSafeEqual(bytes, expected);
}
```

The examples compare decoded bytes, so upper- or lower-case hex both verify.

## Python

`base64.b64decode(hmac_key)` without `validate=True` silently drops characters outside the alphabet. The FastAPI example validates the key and returns `500` if it isn't canonical base64, so a mistyped key shows up as a configuration error rather than as every request failing.

## Check Vector

SpotDraft publishes no vector. This one uses a synthetic key:

| | |
|---|---|
| `hmac_key` | `ZriLMkIFq6U9cm556D0HUEVn2hb3tZWHv5r/u7dgf2I=` |
| Body | `{"id":"evt_1","type":"test","data":{"a":1}}` |
| `X-SD-WEBHOOK-CONTENT-HASH` | `8a0bcf7b021c4420bc9892ba61e3bdd0790759d011db82857aacb7341a73e15301f1e7b55e66c20868031a8102aed0392111e98173ff4c56ca5f4d595c33d347` |

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| Every request fails | The `hmac_key` was used as text. Base64-decode it first |
| Hash is 64 characters | You computed SHA-256. SpotDraft uses SHA-512 |
| Every request fails, key decoded | The body was parsed and re-serialised. HMAC the raw bytes |
| Fails after re-fetching the key | The key changed; update `SPOTDRAFT_HMAC_KEY` (and the Hookdeck source) |
