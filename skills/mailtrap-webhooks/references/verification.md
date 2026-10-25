# How to Verify Mailtrap Webhook Signatures

## How Does Mailtrap Sign Webhooks?

Every request carries `Mailtrap-Signature`: the lowercase hex HMAC-SHA256 of the
**raw request body**, keyed with the webhook's signing secret (32 hex
characters). The body is signed as-is regardless of Content-Type (JSON or JSON
Lines). There is no timestamp and no prefix. No official SDK helper exists, so verify manually.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const received = String(signature).trim();
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(received.toLowerCase(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hashlib, hmac, re

def verify_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    if not signature or not secret:
        return False
    received = signature.strip()
    if not re.fullmatch(r"[0-9a-fA-F]{64}", received):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(received.lower().encode("utf-8"), expected.encode("utf-8"))
```

## Common Gotchas

- **Do not hex-decode the secret.** It looks like hex but is the HMAC key as a plain UTF-8 string.
- **Raw body only.** Re-serialised JSON fails. Express: `express.raw({ type: '*/*' })`, so JSON Lines (`application/jsonl`) bodies also verify. Next.js: `request.text()`. FastAPI: `await request.body()`.
- **Validate before `Buffer.from(x, 'hex')`.** Invalid hex silently truncates. The examples validate with `/^[0-9a-f]{64}$/i` and compare as equal-length UTF-8 buffers.
- **Python:** `hmac.compare_digest` on `str` raises `TypeError` for non-ASCII input (a 500). Encode both sides to bytes.
- Mailtrap's docs sample returns 400 on a bad signature; the examples return 401 for a bad signature and 400 for a missing header. Either way Mailtrap treats any non-200 as a failure and retries.
- Use the secret of the right webhook. Each webhook has its own, and resetting it invalidates the old one at once.

## Debugging Verification Failures

1. Log the byte length of the raw body and compare with the request's Content-Length.
2. Confirm no middleware (`express.json()`, `bodyParser`) ran before the route.
3. Recompute with `openssl`: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex`.
4. Check you copied the secret from the same webhook, with no whitespace.
5. If the header is missing entirely, the request did not come from Mailtrap.
