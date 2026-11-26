# How to Verify Courier Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL — anyone can POST to it. Verifying the
`courier-signature` header proves the request was signed with your webhook secret and
that the body was not tampered with in transit. Always verify before acting on a payload.

## How Courier Signs Webhooks

Courier signs every outbound webhook with **HMAC-SHA256**. There is **no Standard Webhooks**
implementation and **no `webhook-id` / `webhook-timestamp` / `webhook-signature` headers** —
Courier uses a single custom header.

- **Header name:** `courier-signature`
- **Header format:** `t=<timestamp>,signature=<hex_digest>`
  - Example: `t=1631816343012,signature=33777cdae0468ff0939b3609d02d14e6e80ca093c2ea233455f0767055218875`
  - `t` is an epoch timestamp in milliseconds
  - `signature` is the **hex** HMAC-SHA256 digest
- **Signed content:** `` `${timestamp}.${rawBody}` `` — the timestamp, a literal `.`,
  then the exact raw request body
- **Key:** the destination's `whsec_...` signing secret

> **Timestamp unit.** Courier's docs describe `t` as a millisecond timestamp.
> The code below also accepts a ~10-digit seconds value as a safeguard and
> normalizes to milliseconds before comparing. The HMAC is unaffected: it always
> covers the `t` string exactly as received.

> **Sign the raw body.** Courier's docs compute `HMAC_SHA256(secret, "<t>.<raw_body>")`
> and warn that re-serializing the JSON changes the bytes, so the signature won't
> match. Hash the bytes exactly as received.

> **The 5-minute tolerance is a choice, not a documented window.** Courier does
> not publish a replay tolerance, or say whether a retry is re-signed with a new
> `t`. `toleranceMs` is parameterized so you can widen or tighten it; 5 minutes is
> a conventional default.

## No Verification SDK

Courier's SDKs (`@trycourier/courier` for Node, `trycourier` for Python) are for
**sending** notifications and calling the API — they do **not** include a webhook
signature verifier. Verify manually with your language's standard crypto library.

## Implementation

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

// Courier documents `t` in milliseconds. A ~10-digit value would be seconds, so
// normalize to ms either way.
function toMillis(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return NaN;
  return Math.abs(value) < 1e11 ? value * 1000 : value;
}

function verifyCourierWebhook(rawBody, signatureHeader, secret, toleranceMs = 5 * 60 * 1000) {
  if (!signatureHeader) return false;

  // Parse "t=<timestamp>,signature=<hex>"
  const parts = {};
  for (const segment of signatureHeader.split(',')) {
    const i = segment.indexOf('=');
    if (i !== -1) parts[segment.slice(0, i).trim()] = segment.slice(i + 1).trim();
  }
  const timestamp = parts.t;
  const signature = parts.signature;
  if (!timestamp || !signature) return false;

  // Reject stale deliveries (accepts a seconds or milliseconds timestamp)
  const ts = toMillis(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > toleranceMs) return false;

  // Recompute the HMAC over "<timestamp>.<rawBody>"
  // (raw body, not JSON.stringify — equivalent, and avoids re-serialization drift)
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  // Constant-time compare
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false; // hex length mismatch = invalid
  }
}
```

### Python (FastAPI)

```python
import hmac
import hashlib
import time


def to_millis(timestamp: str):
    """Courier documents `t` in milliseconds. A ~10-digit value would be
    seconds, so normalize to ms either way."""
    try:
        value = int(timestamp)
    except ValueError:
        return None
    return value * 1000 if abs(value) < 100_000_000_000 else value


def verify_courier_signature(
    raw_body: bytes,
    signature_header: str,
    secret: str,
    tolerance_ms: int = 5 * 60 * 1000,
) -> bool:
    if not signature_header:
        return False

    # Parse "t=<timestamp>,signature=<hex>"
    parts: dict[str, str] = {}
    for segment in signature_header.split(","):
        key, _, value = segment.partition("=")
        parts[key.strip()] = value.strip()

    timestamp = parts.get("t")
    signature = parts.get("signature")
    if not timestamp or not signature:
        return False

    # Reject stale deliveries (accepts a seconds or milliseconds timestamp)
    ts = to_millis(timestamp)
    if ts is None:
        return False
    if abs(int(time.time() * 1000) - ts) > tolerance_ms:
        return False

    # Recompute the HMAC over "<timestamp>.<raw_body>"
    # (raw body, not json.dumps - equivalent, and avoids re-serialization drift)
    signed_payload = f"{timestamp}.".encode("utf-8") + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()

    # Constant-time compare
    return hmac.compare_digest(expected, signature)
```

## Common Gotchas

- **Use the raw body.** Sign/verify against the exact bytes Courier sent. If you
  `JSON.parse` and re-serialize, key order or whitespace can differ and the HMAC won't
  match. In Express use `express.raw()`; in Next.js use `await request.text()`; in
  FastAPI use `await request.body()`.
- **`t` is in milliseconds.** Compare it with `Date.now()` (or `time.time() * 1000`),
  not a seconds clock, or the staleness check rejects every request.
- **Signature is hex, not base64.** Decode/compare as hexadecimal.
- **Header name is lowercase.** `courier-signature`. HTTP header lookups are
  case-insensitive in these frameworks, but match the documented casing.
- **Constant-time comparison.** Use `crypto.timingSafeEqual` / `hmac.compare_digest` to
  avoid timing attacks. `timingSafeEqual` throws on length mismatch — wrap it in
  try/catch and treat a throw as invalid.

## Debugging Verification Failures

- **Always fails / signature mismatch:** You're almost certainly verifying against a
  re-serialized body. Capture and hash the raw bytes exactly as received.
- **Fails only after a delay:** The timestamp tolerance rejected a replayed or slow
  delivery. Widen `toleranceMs` if your processing is legitimately slow, or check for
  clock skew between your server and Courier. `toleranceMs` is this skill's own
  default — Courier does not publish a window, so tuning it is expected.
- **Every delivery rejected, signature itself looks right:** Check the staleness
  comparison, not the HMAC. Comparing the millisecond `t` with a seconds clock
  fails 100% of requests while the digest computation is correct.
- **`Missing courier-signature` errors:** Confirm the request actually came from Courier
  (or your tunnel) and that no proxy stripped the header.
- **Wrong secret:** Each destination has its own `whsec_` secret, and a destination
  belongs to one environment. Make sure `COURIER_WEBHOOK_SECRET` is the secret of the
  destination that sent the request.
