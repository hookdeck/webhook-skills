# How to Verify Calendly Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL. Without verification, anyone who discovers it
could POST fake `invitee.created` or `invitee.canceled` events. Verifying the
`Calendly-Webhook-Signature` header proves the request came from Calendly and that the
payload wasn't modified in transit. Rejecting stale timestamps additionally prevents
**replay attacks** where an attacker resends a previously valid request.

## How It Works

Calendly signs each webhook and sends the result in the **`Calendly-Webhook-Signature`**
header, formatted as a comma-separated list of `key=value` pairs:

```
Calendly-Webhook-Signature: t=1719921600,v1=8f2d...c1a9
```

- `t` — the Unix timestamp (seconds) when Calendly generated the signature.
- `v1` — the HMAC-SHA256 signature, hex-encoded.

To verify:

1. Parse `t` and `v1` from the header.
2. Build the **signed content** by concatenating: `{t}.{raw request body}`.
3. Compute `HMAC-SHA256` of that string using your subscription's **signing key**,
   hex-encoded.
4. Compare your computed value to `v1` using a **timing-safe** comparison.
5. Reject the request if the timestamp is older than your tolerance (~3 minutes / 180s).

There is no official Calendly SDK helper for webhook verification, so implement it
manually in every framework.

## Implementation

### Manual Verification (Node.js / Express / Next.js)

```javascript
const crypto = require('crypto');

function verifyCalendlySignature(rawBody, header, signingKey, toleranceSec = 180) {
  if (!header) return false;

  // Parse "t=...,v1=..." into { t, v1 }
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Replay protection: reject stale timestamps
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > toleranceSec) return false;

  // signed content = "{timestamp}.{raw body}"
  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  // Timing-safe compare (handles length mismatch)
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}
```

### Manual Verification (Python / FastAPI)

```python
import hmac
import hashlib
import time


def verify_calendly_signature(raw_body: bytes, header: str, signing_key: str,
                              tolerance_sec: int = 180) -> bool:
    if not header:
        return False

    # Parse "t=...,v1=..." into a dict
    parts = dict(
        item.split("=", 1) for item in header.split(",") if "=" in item
    )
    timestamp = parts.get("t")
    signature = parts.get("v1")
    if not timestamp or not signature:
        return False

    # Replay protection: reject stale timestamps
    if abs(int(time.time()) - int(timestamp)) > tolerance_sec:
        return False

    # signed content = "{timestamp}.{raw body}"
    signed_content = f"{timestamp}.".encode("utf-8") + raw_body
    expected = hmac.new(
        signing_key.encode("utf-8"), signed_content, hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(expected, signature)
```

## Common Gotchas

- **Use the raw body.** Compute the HMAC over the exact bytes Calendly sent. If you
  `JSON.parse` and re-serialize, key ordering or whitespace changes will break the
  signature. In Express use `express.raw()`; in Next.js use `await request.text()`;
  in FastAPI use `await request.body()`.
- **Include the timestamp in the signed content.** The signed string is
  `{t}.{body}`, **not** just the body. Signing only the body is a common mistake that
  makes valid signatures fail.
- **Hex, not base64.** The `v1` value is hex-encoded. Decode/compare as hex.
- **Timing-safe comparison.** Use `crypto.timingSafeEqual` /
  `hmac.compare_digest` rather than `===`/`==` to avoid timing attacks, and guard
  against buffer length mismatches.
- **Per-subscription key.** Each webhook subscription has its own signing key. Verify
  with the key that belongs to the subscription that sent the request.
- **Timestamp tolerance.** Reject timestamps older than ~180 seconds to prevent
  replay. Ensure your server clock is roughly in sync (NTP).

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Always fails, even fresh requests | Signing over parsed/re-serialized JSON instead of the raw body |
| Fails intermittently after a delay | Timestamp tolerance too tight, or server clock drift |
| Fails for one subscription only | Using the wrong subscription's signing key |
| `timingSafeEqual` throws | Comparing buffers of different lengths — wrap in try/catch and return false |
| Header is `undefined` | Header name is case-insensitive; read `calendly-webhook-signature` (lowercased by most frameworks) |
