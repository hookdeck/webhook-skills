# Checkr Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Header | `X-Checkr-Signature` |
| Algorithm | HMAC-SHA256, lowercase hex, no prefix |
| Key | Direct accounts: the oldest secret API key. Partner apps: the application's client secret. Used as UTF-8 text |
| Signed content | The raw request body |
| Timestamp | None |

Checkr's docs show the check with openssl, whose default output is hex:

```bash
printf "$compact_json" | openssl sha256 -hmac "$YOUR_API_KEY"
```

`$compact_json` is the non-pretty-printed JSON, which is what Checkr sends. Verify the bytes you received. Don't parse and re-serialise them: Checkr's examples repo warns that pretty JSON with spaces won't work, and a serializer can also change escaping.

## Node.js

```javascript
const crypto = require('crypto');

function verifyCheckrSignature(rawBody, signature, key) {
  const secret = String(key || '').trim();
  const value = String(signature || '').trim();
  if (!secret || !/^[0-9a-fA-F]{64}$/.test(value)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'hex'), expected);
}
```

## Python

```python
import hashlib, hmac, re

def verify_checkr_signature(raw_body: bytes, signature: str, key: str) -> bool:
    value = (signature or "").strip()
    if not key or not re.fullmatch(r"[0-9a-fA-F]{64}", value):
        return False
    expected = hmac.new(key.strip().encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(value), expected)
```

## Test Vector

From Checkr's [webhook-verification-examples](https://github.com/checkr/webhook-verification-examples) repo. Every example's tests check it.

| | |
|---|---|
| Key | `test-secret` |
| Body | `{"monday":"75F","tuesday":"80F"}` |
| `X-Checkr-Signature` | `b7412f05e981a473b5ecbdb5393afaea02a679db6d7c8e56803512ec4ba98151` |

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| Header says "Please create an API key…" | The account has no API key. Create one |
| Every request fails | Wrong key: direct accounts use the **oldest** secret API key, Partner apps the client secret |
| Every request fails, right key | The body was parsed and re-serialised (for example by `express.json()`). HMAC the raw bytes |
| Fails after deleting a key | You deleted the oldest secret API key, so a different key now signs. Update `CHECKR_SIGNING_KEY` |
| Partner events fail with the customer's token | Partner events are signed with your client secret, not the customer's access token |
