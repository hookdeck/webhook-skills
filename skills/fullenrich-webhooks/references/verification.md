# FullEnrich Signature Verification

## How Does FullEnrich Sign Webhooks?

Every webhook carries `X-Signature-SHA1`: the **lowercase hex** HMAC-SHA1 of the raw request body, with your **FullEnrich API key** as the secret. SHA-1, not SHA-256. No timestamp, no prefix, no separate webhook secret. FullEnrich provides no webhook SDK.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyFullEnrichSignature(rawBody, signature, apiKey) {
  if (!signature || !apiKey || !/^[0-9a-f]{40}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha1', apiKey).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature.toLowerCase()));
}
```

The regex check matters: `Buffer.from(x, 'hex')` silently truncates invalid hex. Comparing the lowercase hex strings as equal-length UTF-8 buffers avoids that.

### Python

```python
import hashlib, hmac

def verify_fullenrich_signature(raw_body: bytes, signature, api_key: str) -> bool:
    expected = hmac.new(api_key.encode(), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(expected.encode(), (signature or "").lower().encode())
```

Encode both sides to bytes: `hmac.compare_digest` raises `TypeError` for non-ASCII `str`, which would turn a bad header into a 500 instead of a 401.

## Common Gotchas

- **Raw body**: verify before parsing. Re-serialized JSON changes whitespace and key order and breaks the hash. In Express use `express.raw({ type: '*/*' })`; FullEnrich's own sample uses `application/json`, but `*/*` verifies any content type.
- **Key**: the API key, not a webhook secret. Regenerating the key changes the signing key.
- **Algorithm**: SHA-1.
- **Case**: the documented hex is lowercase; normalize before comparing.
- **No replay protection**: there is no timestamp, so deduplicate by result `id` and `status`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Wrong key (for example a stale key after regenerating), or using SHA-256 |
| Invalid only with some clients | Body parsed or re-serialized before verifying |
| 500 on odd headers | Python `compare_digest` on non-ASCII `str`; encode to bytes |
| Missing header | Request did not come from FullEnrich, or a proxy stripped it |
