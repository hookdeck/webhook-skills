# How to Verify Vitable Health Webhook Signatures

## How Does Vitable Sign Webhooks?

Each delivery carries two headers:

```
X-Vitable-Signature: sha512=<signature>
X-Vitable-Timestamp: <unix_timestamp>
```

The signature is the lowercase hex **HMAC-SHA512** (128 characters, not SHA-256) of `<timestamp>.<payload>`, keyed with the subscription's secret key:

```python
message = f"{timestamp}.{payload}"
expected = "sha512=" + hmac.new(secret_key.encode("utf-8"), message.encode("utf-8"), hashlib.sha512).hexdigest()
```

Vitable provides no SDK for verification; verify manually. This is the same scheme Hookdeck's Vitable Health source checks (HMAC, `sha512`, header `x-vitable-signature`, hex, signed content `{X-Vitable-Timestamp}.{body}`).

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyVitable(rawBody, headers, secret) {
  const signature = headers['x-vitable-signature'];
  const timestamp = headers['x-vitable-timestamp'];
  if (!secret || !signature || !timestamp) return false;

  const hex = (signature.startsWith('sha512=') ? signature.slice(7) : signature).toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(hex)) return false;

  const expected = crypto.createHmac('sha512', secret)
    .update(Buffer.from(timestamp, 'latin1')).update('.').update(rawBody).digest();
  const given = Buffer.from(hex, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
```

### Python

```python
import hashlib, hmac, re

def verify_vitable(raw_body: bytes, headers, secret: str) -> bool:
    signature = headers.get("x-vitable-signature")
    timestamp = headers.get("x-vitable-timestamp")
    if not (secret and signature and timestamp):
        return False
    digest = signature.removeprefix("sha512=").lower()
    if not re.fullmatch(r"[0-9a-f]{128}", digest):
        return False
    message = timestamp.encode("latin-1") + b"." + raw_body
    expected = hmac.new(secret.encode(), message, hashlib.sha512).digest()
    return hmac.compare_digest(bytes.fromhex(digest), expected)
```

Vitable's docs verify with `hmac.compare_digest(signature_header, expected)` on the full `sha512=...` string. The code above compares decoded bytes instead, which is equivalent for a well-formed header and also accepts the bare digest and uppercase hex (as Hookdeck does).

## Common Gotchas

- **Raw body.** The signature covers the exact bytes Vitable sent. Use `express.raw({ type: '*/*' })` (Express), `await request.arrayBuffer()` (Next.js) or `await request.body()` (FastAPI). Never `JSON.parse` and re-serialize, and don't decode to a string and re-encode.
- **Timestamp is signed as the header string.** Use the `X-Vitable-Timestamp` value exactly as received (latin-1 bytes; never trimmed or re-formatted).
- **SHA-512, not SHA-256.** The digest is 128 hex characters.
- **Secret is used as-is.** UTF-8 bytes of the string Vitable gave you; don't hex- or base64-decode it.
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops invalid characters, so check for exactly 128 hex characters first, then compare equal-length buffers with `crypto.timingSafeEqual` / `hmac.compare_digest` on bytes.
- **Prefix is optional here.** `sha512=` is stripped if present; a bare digest is accepted too.
- **One secret per subscription.** A secret from a different subscription fails verification.

## Should I Reject Old Timestamps?

Vitable's examples reject a timestamp more than 300 seconds from now. That protects against replays, but **Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck itself applies no tolerance**, so a fixed window would reject legitimate redeliveries (Vitable's own retries span about 3.4 days). The examples leave the check off by default and make it opt-in:

```bash
VITABLE_WEBHOOK_TOLERANCE_SECONDS=300   # unset or 0 = off
```

When it's set to a positive whole number, the timestamp must be an integer within that many seconds of the current Unix time (the comparison Vitable's sample code makes), or the request gets a `401`. Idempotent handling on `event_id` is the main defence against replayed events.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always `401` | Wrong secret (or another subscription's), or the body was parsed and re-serialized before verifying |
| `401` only for some deliveries | Tolerance enabled and the delivery is a retry or replay |
| `401` with a valid-looking secret | Secret was decoded (hex/base64) instead of used as UTF-8, or SHA-256 used instead of SHA-512 |
| Signature length not 128 | Header truncated by a proxy, or not the `X-Vitable-Signature` header |
