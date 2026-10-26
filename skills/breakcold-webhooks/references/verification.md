# How to Verify Breakcold Webhook Signatures

## How It Works

| | |
|---|---|
| Header | `X-Webhook-Signature`, formatted `sha256=<hex>` |
| Algorithm | HMAC-SHA256, lowercase hex |
| Signed content | `X-Webhook-Timestamp` value + `.` + raw request body |
| Key | The endpoint signing secret, as a UTF-8 string |
| Timestamp | `X-Webhook-Timestamp`, Unix seconds, part of the signed content |

Breakcold's docs: "The signed string is `${timestamp}.${rawBody}`, where `timestamp` is the `X-Webhook-Timestamp` header and `rawBody` is the exact request body string."

## Implementation

Build the signed message as bytes: the timestamp header exactly as received (latin1), a literal `.`, then the raw body bytes. Do not decode the body to a string and re-encode it.

### Node.js

```javascript
const crypto = require('crypto');

function verifyBreakcoldSignature(rawBody, signatureHeader, timestampHeader, secret) {
  if (!signatureHeader || !timestampHeader || !secret) return false;
  const digest = signatureHeader.replace(/^sha256=/i, '');
  if (!/^[0-9a-f]{64}$/i.test(digest)) return false;

  const signed = Buffer.concat([
    Buffer.from(timestampHeader, 'latin1'), Buffer.from('.'), rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signed).digest();
  return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), expected);
}
```

### Python

```python
import hashlib, hmac, re

def verify_breakcold_signature(raw_body: bytes, signature, timestamp, secret) -> bool:
    if not signature or not timestamp or not secret:
        return False
    digest = re.sub(r"^sha256=", "", signature, count=1, flags=re.IGNORECASE)
    if not re.fullmatch(r"[0-9a-fA-F]{64}", digest):
        return False
    signed = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(digest), expected)
```

Breakcold publishes no webhook verification SDK, so manual HMAC is the supported path in every framework.

## Optional Replay Window

The examples skip timestamp checks by default. Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck itself applies no tolerance, so a fixed window would reject legitimate retries. To opt in, set `BREAKCOLD_WEBHOOK_TOLERANCE_SECONDS` (for example `300`). The handler then rejects requests whose `X-Webhook-Timestamp` differs from the current Unix time by more than that many seconds. Unset or `0` turns it off. Idempotency on `X-Webhook-Delivery-Id` is the default replay defence.

## Common Gotchas

- **Raw body**: any parsing or re-serialization (`express.json()`, `request.json()`) changes the bytes and breaks the MAC. Use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` or `await request.body()`.
- **The timestamp is signed.** A MAC over the body alone will not match.
- **Prefix**: the header carries `sha256=`. Strip it before comparing. A bare digest is also accepted by Hookdeck's parser.
- **Hex case**: compare case-insensitively (decode both sides to bytes).
- **Secret**: use the string exactly as copied; do not hex- or base64-decode it, and do not trim it.
- **Validate before decoding**: `Buffer.from(x, 'hex')` silently drops invalid characters, so check for exactly 64 hex characters first. `timingSafeEqual` throws on unequal lengths.
- **Compare bytes in constant time** (`crypto.timingSafeEqual`, `hmac.compare_digest` on `bytes`).
- **Failure status**: return `401` for a missing, malformed or mismatching signature.

## Debugging Verification Failures

1. Log the raw body length and confirm it matches the delivery in Breakcold's delivery log.
2. Confirm the timestamp you sign is the `X-Webhook-Timestamp` header, not the `timestamp` field in the JSON body.
3. Confirm the secret belongs to this endpoint (each endpoint has its own).
4. Check that no middleware parsed the body first.
5. Send the endpoint's test button: `webhook.test` is signed the same way.
6. Recompute by hand:

```bash
printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1
```
