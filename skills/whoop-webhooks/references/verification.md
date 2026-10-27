# WHOOP Signature Verification

## How Does WHOOP Sign Webhooks?

Two headers accompany every webhook:

| Header | Value |
|--------|-------|
| `X-WHOOP-Signature` | Standard padded base64 HMAC-SHA256 (44 characters, no prefix) |
| `X-WHOOP-Signature-Timestamp` | Unix timestamp in **milliseconds** |

```
signature = base64( HMAC-SHA256( key = client_secret,
                                 msg = X-WHOOP-Signature-Timestamp value + raw body ) )
```

- The timestamp comes **first**, then the raw body bytes, with **no separator**.
- The key is the WHOOP app's OAuth **client secret** as UTF-8 bytes, used as-is (not decoded). There is no separate webhook secret.
- Compare the whole header as one digest. There is no prefix and no list of signatures.

## Implementation

WHOOP does not document an SDK for webhook verification, so verify manually. Build the message as bytes: the timestamp header string as latin1, then the body bytes untouched.

### Node.js

```javascript
const crypto = require('crypto');
const SIG_RE = /^[A-Za-z0-9+/]{43}=$/;

function verifyWhoopSignature(rawBody, signature, timestamp, secret) {
  if (!signature || !timestamp || !secret || !SIG_RE.test(signature)) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(timestamp, 'latin1'), rawBody]))
    .digest('base64');
  return crypto.timingSafeEqual(Buffer.from(signature, 'latin1'), Buffer.from(expected, 'latin1'));
}
```

### Python

```python
import base64, hashlib, hmac, re
SIG_RE = re.compile(r"[A-Za-z0-9+/]{43}=")

def verify_whoop_signature(raw_body, signature, timestamp, secret):
    if not signature or not timestamp or not secret or not SIG_RE.fullmatch(signature):
        return False
    digest = hmac.new(secret.encode(), timestamp.encode("latin-1") + raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64encode(digest), signature.encode("ascii"))
```

## Optional Timestamp Tolerance

By default the examples **do not** reject old timestamps. Hookdeck retries and replays resend the original headers and timestamp (and Hookdeck applies no tolerance itself), so a fixed window would reject legitimate deliveries.

To opt in, set `WHOOP_WEBHOOK_TOLERANCE_SECONDS` (unset or `0` = off). The check runs after the signature is verified: the timestamp must be digits only, and `|now_ms - timestamp_ms| <= tolerance * 1000`, otherwise `401`. Remember the timestamp is **milliseconds**, not seconds.

## Common Gotchas

- **Raw body.** Express: `express.raw({ type: '*/*' })` so any content type is read as bytes. Next.js: `Buffer.from(await request.arrayBuffer())`. FastAPI: `await request.body()`. Parse JSON only after verification.
- **Don't decode and re-encode the body**, and don't `JSON.parse`/`JSON.stringify` before verifying.
- **Wrong secret.** The key is the app's client secret, not a dedicated webhook secret.
- **No separator.** `timestamp + body`, not `timestamp.body`.
- **Milliseconds.** The timestamp is in ms; seconds-based tolerance code will mis-compare.
- **Don't decode unvalidated base64.** Node's `Buffer.from(sig, 'base64')` silently drops invalid characters, so check the format first and compare the strings in constant time.
- **Case-sensitive.** Base64 is compared exactly.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong secret (use the client secret) or body was parsed before verifying |
| Fails for some payloads only | Body re-serialized or decoded as text |
| Fails only behind a proxy | Proxy altered the body or dropped `X-WHOOP-Signature-Timestamp` |
| Tolerance rejects retries | Tolerance enabled; retries keep the original timestamp |
