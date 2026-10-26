# How to Verify Magic Hour Webhook Signatures

## How It Works

Magic Hour signs every delivery with HMAC-SHA256 and sends two headers:

| Header | Meaning |
|--------|---------|
| `magic-hour-event-signature` | Lowercase hex digest, exactly 64 characters, no prefix |
| `magic-hour-event-timestamp` | Unix seconds when this attempt was sent |

The signed message is the timestamp header value, a literal `.`, then the raw request body
(`{timestamp}.{raw_json_payload}`). The HMAC key is the webhook secret as UTF-8 bytes, used
whole including its `whsec_` prefix.

This is **not** Standard Webhooks. There is no `webhook-id`, nothing is base64-decoded and the
digest is hex, so the `standardwebhooks` and `svix` libraries will not verify these requests.
Magic Hour has no official verification SDK; verify manually as below.

## Implementation

### Node.js (manual)

```javascript
const crypto = require('crypto');

function verifyMagicHour(rawBody, headers, secret) {   // rawBody: Buffer
  const sig = headers['magic-hour-event-signature'];
  const ts = headers['magic-hour-event-timestamp'];
  if (!secret || !sig || !ts || !/^[0-9a-fA-F]{64}$/.test(sig)) return false;

  const message = Buffer.concat([Buffer.from(ts, 'latin1'), Buffer.from('.'), rawBody]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
  const received = Buffer.from(sig, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

### Python (manual)

```python
import hashlib, hmac, re

HEX64 = re.compile(r"[0-9a-fA-F]{64}")

def verify_magic_hour(raw_body: bytes, headers, secret: str) -> bool:
    sig = headers.get("magic-hour-event-signature")
    ts = headers.get("magic-hour-event-timestamp")
    if not secret or not sig or not ts or not HEX64.fullmatch(sig):
        return False
    message = b"".join([ts.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(sig), expected)   # bytes, never str
```

## Optional Timestamp Tolerance

Magic Hour recommends rejecting timestamps outside about 5 minutes. This skill leaves that
**off by default**: retries and Hookdeck replays resend the original headers, and Hookdeck
applies no tolerance, so a fixed window rejects legitimate redeliveries. Set
`MAGIC_HOUR_WEBHOOK_TOLERANCE_SECONDS` (for example `300`; unset or `0` = off) to opt in. The
examples then require the timestamp to be digits only and within that many seconds of now, in
either direction. A failure returns `401`. Either way the timestamp is part of the signed
message, so it can't be altered without breaking the signature.

## Common Gotchas

- **Raw body**: sign the exact bytes received. Don't `JSON.parse`/`JSON.stringify`, and don't
  decode to a string and re-encode. Express: `express.raw({ type: '*/*' })`; Next.js:
  `await request.arrayBuffer()`; FastAPI: `await request.body()`.
- **Header values are used as-is**: the timestamp header is concatenated exactly as received
  (latin1 bytes), never trimmed, parsed or reformatted.
- **Secret is not decoded**: keep `whsec_` and use the UTF-8 bytes directly.
- **Validate before decoding**: `Buffer.from(sig, 'hex')` silently drops invalid characters, so
  check for exactly 64 hex characters first. Hex is case-insensitive.
- **Compare in constant time**: `crypto.timingSafeEqual` on equal-length Buffers (check lengths
  first, it throws otherwise) or `hmac.compare_digest` on bytes.
- **Signature regenerates per attempt**: don't cache a signature or timestamp from an earlier
  delivery.

## Debugging Verification Failures

1. **Always 401**: print both header values. A missing `magic-hour-event-signature` means the
   request didn't come from Magic Hour (or a proxy stripped headers).
2. **Secret mismatch**: confirm `MAGIC_HOUR_WEBHOOK_SECRET` is the full `whsec_...` value from the
   webhook you registered, with no quotes or trailing whitespace. Each webhook has its own secret.
3. **Body mismatch**: log `rawBody.length` and compare with `Content-Length`. If a JSON parser
   ran first, the bytes differ.
4. **Fails only on old events**: tolerance is enabled and a retry arrived later than the window.
   Unset `MAGIC_HOUR_WEBHOOK_TOLERANCE_SECONDS` or widen it.
