# How to Verify Ayrshare Webhook Signatures

## How Does Ayrshare Sign Webhooks?

When a signing secret is set, every delivery carries:

```
X-Authorization-Timestamp: <Unix timestamp in seconds>
X-Authorization-Content-SHA256: <current-sig>
X-Authorization-Content-SHA256-V2: v1=<current-sig>
```

The signature is lowercase hex `HMAC-SHA256(secret, raw request body)`. The V2
header is always present on a signed delivery, so verify that one. The timestamp
is **not** part of the signed content and no id is signed, so there is no replay
window to enforce. Do not invent one from unsigned headers or body fields; dedupe
on `hookId` instead.

Without a secret, deliveries are unsigned.

> Register a webhook secret with Ayrshare. Without one, deliveries are unsigned and fail verification.

## What Happens During Secret Rotation?

For 24 hours after a rotation, `X-Authorization-Content-SHA256-V2` carries two
entries: `v1=<current>,v1=<previous>`. Split on commas, trim spaces, strip `v1=`,
and accept the delivery if **any** entry matches. Ignore entries with other keys.
The bare `X-Authorization-Content-SHA256` header carries only the current
signature, which is why the examples verify the V2 header.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');
const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

function verifyAyrshareSignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  let matched = false;
  for (const part of header.split(',')) {
    let candidate = part.trim();
    if (candidate.startsWith('v1=')) candidate = candidate.slice(3);
    else if (candidate.includes('=')) continue;
    if (!HEX_SHA256.test(candidate)) continue;
    if (crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), expected)) matched = true;
  }
  return matched;
}
```

### Python

```python
import hashlib, hmac, re

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")

def verify_ayrshare_signature(raw_body: bytes, header, secret: str) -> bool:
    if not header or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    matched = False
    for part in header.split(","):
        candidate = part.strip()
        if candidate.startswith("v1="):
            candidate = candidate[3:]
        elif "=" in candidate:
            continue
        if not HEX_SHA256.fullmatch(candidate):
            continue
        if hmac.compare_digest(bytes.fromhex(candidate), expected):
            matched = True
    return matched
```

Hookdeck's Ayrshare source also accepts the bare digest, so the examples accept the
value with or without `v1=`. Hex is compared case-insensitively.

## Common Gotchas

- **Use the raw bytes.** Express: `express.raw({ type: '*/*' })`. Next.js:
  `await request.arrayBuffer()`. FastAPI: `await request.body()`. Never
  `JSON.parse` then `JSON.stringify` before verifying.
- **Validate the format before decoding.** `Buffer.from(sig, 'hex')` silently drops
  bad characters; require exactly 64 hex characters first. Compare equal-length
  buffers (Node) or `bytes` (Python `hmac.compare_digest`, never `str`).
- **The key is the secret text as UTF-8.** Do not hex- or base64-decode it.
- **Retries have different bytes.** Each attempt rebuilds the payload (`timeStamp`
  and the signature change), so verify every delivery on its own and dedupe on `hookId`.
- **One secret per profile.** User Profiles each have their own; a delivery for a
  User Profile is signed with that profile's secret.
- **4xx is final.** Returning `401` for a bad signature is correct, but an
  intermittent `401` (e.g. mid-rotation with a stale secret) is never retried.

## How to Debug Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Header missing | No secret registered: deliveries are unsigned. Set one |
| Always fails | Body was parsed or re-encoded before hashing; wrong secret or profile |
| Fails only after rotating | Update `AYRSHARE_WEBHOOK_SECRET` to the new secret (the old still matches for 24 h) |
| Fails for some profiles | Different User Profile, different secret |
