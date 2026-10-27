# How to Verify Terra API Webhook Signatures

## How Does Terra Sign Webhooks?

Every delivery carries a `terra-signature` header:

```
terra-signature: t=1723808700,v1=a5ee9dba96b4f65aeff6c841aa50121b1f73ec7990d28d53b201523776d4eb00
```

| Part | Meaning |
|------|---------|
| `t` | Unix timestamp in seconds |
| `v1` | HMAC-SHA256 of `<t>.<raw body>`, lowercase hex (64 characters) |
| `v0` | May appear in Terra's manual example; ignore it |

The signed string is the `t` value, a literal `.`, then the raw request body. The key is the destination's signing secret as UTF-8 bytes. The docs never say "hex"; it is read from the 64-character example values.

## Manual Verification

### Node.js

```javascript
const crypto = require('crypto');

function verifyTerra(rawBody, header, secret) {
  if (!secret || !header) return false;
  let t;
  const sigs = [];
  for (const item of header.split(',')) {
    const i = item.indexOf('=');
    if (i <= 0) continue;
    const key = item.slice(0, i).trim(), value = item.slice(i + 1).trim();
    if (key === 't' && t === undefined) t = value;
    else if (key === 'v1') sigs.push(value);
  }
  if (!t || sigs.length === 0) return false;
  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex'));
  return sigs.some((s) => /^[0-9a-fA-F]{64}$/.test(s) &&
    crypto.timingSafeEqual(Buffer.from(s.toLowerCase()), expected));
}
```

### Python

```python
import hashlib, hmac, re

def verify_terra(raw_body: bytes, header, secret: str) -> bool:
    if not secret or not header:
        return False
    t, sigs = None, []
    for item in header.split(","):
        key, sep, value = item.partition("=")
        key, value = key.strip(), value.strip()
        if not sep or not key:
            continue
        if key == "t" and t is None:
            t = value
        elif key == "v1":
            sigs.append(value.encode())
    if not t or not sigs:
        return False
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest().encode()
    return any(re.fullmatch(rb"[0-9a-fA-F]{64}", s) and hmac.compare_digest(s.lower(), expected) for s in sigs)
```

Terra does not document an SDK verification helper for this, so the examples verify manually in all three frameworks.

## What Are the Common Gotchas?

- **Raw body.** Verify the exact bytes. Express: `express.raw({ type: '*/*' })`. Next.js: `await request.arrayBuffer()`. FastAPI: `await request.body()`. Parse JSON only after the check; re-serialised JSON will not match.
- **Build the message as bytes.** `t` bytes + `.` + body bytes. Never decode the body to a string and re-encode it.
- **Keep `t` as a string.** Don't parse it to a number and format it back (leading zeros or whitespace would change the message).
- **Several `v1` values.** Accept the delivery if any one matches (key rotation). Ignore `v0` and other keys.
- **Validate before comparing.** Require exactly 64 hex characters. Lowercase both sides (hex is compared case-insensitively), then compare in constant time: `crypto.timingSafeEqual` on equal-length Buffers, `hmac.compare_digest` on bytes. Never `Buffer.from(sig, 'hex')` an unvalidated value, because it silently drops bad characters.
- **Secret as-is.** Don't hex- or base64-decode it.
- **Status code.** Missing or empty header, no `t`, malformed value or mismatch: `401`.
- **Timestamp tolerance is opt-in.** The examples don't reject old timestamps unless `TERRA_WEBHOOK_TOLERANCE_SECONDS` is a positive whole number. Hookdeck retries and replays resend the original headers, and Hookdeck itself applies no tolerance, so a fixed window would reject legitimate redeliveries. If you opt in, measure against `t` (Unix seconds).
- **8-second budget.** Respond `2xx` within 8 seconds; do heavy work after acknowledging.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Always `401` | Wrong secret (copied from another destination), or body parsed before verifying |
| `401` only on some deliveries | Body modified by middleware (compression, JSON re-serialisation) |
| `401` for old deliveries only | `TERRA_WEBHOOK_TOLERANCE_SECONDS` is set and the retry is older than the window |
| `500` | `TERRA_WEBHOOK_SECRET` is not set |
