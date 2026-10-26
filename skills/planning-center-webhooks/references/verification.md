# How to Verify Planning Center Webhook Signatures

## How It Works

Planning Center puts a signature in the `X-PCO-Webhooks-Authenticity` header. It is an **HMAC-SHA256** digest, hex encoded with no prefix, computed over the **raw request body** with the subscription's `authenticity_secret` as the key. There is no timestamp or message ID in the signed content.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyPlanningCenter(rawBody, signature, secret) {
  // Validate the format before hex-decoding: Buffer.from(x, 'hex') silently truncates invalid hex
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
```

An alternative with no hex decoding: compare the lowercase hex strings as equal-length UTF-8 Buffers with `timingSafeEqual` after checking lengths match.

### Python

```python
import hashlib, hmac

def verify_planning_center(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode(), signature.lower().encode())
```

## Worked Example From the Docs

The Authenticity section of the docs gives:

- secret: `2608ab74db02d670279278a90585fca300953f0a19fd96529cb61bb92ed39d86`
- expected: `a0782fde663e7ee25a99b9d44f45434120ff027ba98ef333a83a4590fcc97828`

The body is shown as a Ruby single-quoted string, in which `\"` is a literal backslash followed by a quote (the inner `payload` is a JSON string, so those backslashes are part of the real body). Each example's `fixtures/authenticity-example.json` holds the body with that unescaping applied, and the tests assert the signature matches.

## Common Gotchas

- **Do not hex-decode the secret.** It looks like hex, but Ruby's `OpenSSL::HMAC.hexdigest` uses the string's bytes as the key. Hex-decoding gives a different digest.
- **Use the raw body.** Don't re-serialize parsed JSON. In Express use `express.raw({ type: '*/*' })` so any content type is read as bytes.
- **Validate header format before hex decoding** in Node, or invalid input is silently truncated.
- **Compare as bytes in Python.** `hmac.compare_digest` raises `TypeError` for non-ASCII `str`; encode both sides so a bad header gives 401, not 500.
- **`attributes.payload` is a string.** Verify first, then `JSON.parse` the body, then parse `payload` again.
- **Each subscription has its own secret.** Look up the secret for the subscription that sent the request.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Digest never matches | Secret hex-decoded, a body parser re-serialized the JSON, or the wrong subscription's secret |
| Matches in tests, fails live | Proxy or framework altered the body (compression, trimmed whitespace) |
| 500 on odd headers | Non-string compare in Python, or `Buffer.from(x, 'hex')` on invalid input |
