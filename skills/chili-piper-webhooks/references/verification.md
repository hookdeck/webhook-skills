# How to Verify Chili Piper Webhook Signatures

## How Does Chili Piper Sign Webhooks?

Every request includes two headers:

| Header | Value |
|--------|-------|
| `X-Chili-Signature` | HMAC-SHA256 of the payload, hex-encoded, lowercase, no prefix |
| `X-Chili-Timestamp` | Unix timestamp in seconds when the request was signed |

The signed message is `{timestamp}.{raw_request_body}`: the `X-Chili-Timestamp` header value, a literal `.`, then the raw body bytes. The key is your tenant's signing secret as UTF-8 bytes, used as-is (not hex- or base64-decoded). Chili Piper has no webhook verification SDK, so verify manually. The secret comes from Chili Piper support: see [setup.md](setup.md).

## Implementation

Build the signed message as **bytes**, the way Hookdeck's Chili Piper source does: separators as UTF-8, the timestamp header value encoded latin1 exactly as received (never trimmed, parsed or re-formatted), and the raw body bytes appended unchanged.

### Node.js

```javascript
const crypto = require('crypto');

function verifyChiliPiper(rawBody, signature, timestamp, secret) {
  if (!signature || !timestamp || !secret) return false;
  // Validate before decoding: Buffer.from(x, 'hex') silently drops bad characters
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const signed = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(signed).digest();
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected); // both 32 bytes
}
```

In Express use `express.raw({ type: '*/*' })`, in Next.js `Buffer.from(await request.arrayBuffer())`.

### Python

```python
import hashlib, hmac, re

def verify_chili_piper(raw_body: bytes, signature: str, timestamp: str, secret: str) -> bool:
    if not signature or not timestamp or not secret:
        return False
    if not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    signed = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature), expected)  # bytes, never str
```

In FastAPI use `await request.body()`.

The hex digest is compared case-insensitively (decoding to bytes handles that). Compare the whole header value as one digest: there is no list of signatures and no prefix to parse.

## How Do I Test My Implementation?

Test vector (secret and body are made up for this skill):

- Secret: `test_chili_piper_secret`
- `X-Chili-Timestamp`: `1742589000`
- Body: `{"meetingIdChili":"123e4567-e89b-12d3-a456-426614174000","type":"Created"}` (compact, no trailing newline)
- Expected `X-Chili-Signature`: `6a44e57295b1df93c32af22231c457052e8ae688ac1856f7320f39a7b2fb67bf`

```bash
printf '%s' '1742589000.{"meetingIdChili":"123e4567-e89b-12d3-a456-426614174000","type":"Created"}' \
  | openssl dgst -sha256 -hmac 'test_chili_piper_secret' -hex
```

The example tests include this vector.

## How Do I Prevent Replay Attacks?

Chili Piper suggests rejecting timestamps older than 5 minutes (300 s). This skill does **not** do that by default: Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck itself applies no tolerance, so a fixed window would reject legitimate retries. The examples enable the check only when `CHILI_PIPER_WEBHOOK_TOLERANCE_SECONDS` is set above 0 (unset or `0` = off). When on, a request is rejected with `401` if `X-Chili-Timestamp` is not a whole number of seconds or differs from the current time by more than the tolerance. Otherwise, de-duplicate on `meetingIdChili` plus `type`.

## Common Gotchas

- **Raw body**: sign the exact bytes received. Parsing and re-serializing the JSON, or decoding to a string and back, changes the signature.
- **Content type**: read the raw body whatever the content type. Chili Piper's sample uses `express.raw({ type: 'application/json' })`; `type: '*/*'` is safer.
- **Timestamp is part of the message**: you need both headers. A request without `X-Chili-Timestamp` cannot be verified.
- **Secret handling**: use the secret exactly as support sent it, with no trimming of internal characters. Strip only stray whitespace from your `.env` line.
- **Unequal lengths**: `timingSafeEqual` throws on different lengths, so validate the 64-character hex format first.
- **Rotation**: after support rotates the secret the old one stops working immediately.

## Debugging Verification Failures

1. Confirm the webhook is created and **enabled**, and that support has issued the secret. An empty `X-Chili-Signature` header usually means one of these is missing.
2. Run the test vector above through your code. If it passes, the problem is the secret or body handling.
3. Log the raw body length and confirm it is a Buffer/bytes, not a parsed object.
4. Check that no middleware or proxy rewrites the body.
5. Make sure the timestamp in the signed message is the header value, not the current time.
6. After a rotation, update `CHILI_PIPER_WEBHOOK_SECRET`.
