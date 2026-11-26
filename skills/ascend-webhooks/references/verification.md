# Ascend Signature Verification

## How It Works

Ascend signs every webhook with a **custom Stripe-style HMAC-SHA256 scheme**.
It is **not** Svix and **not** Standard Webhooks — so do not reach for
`webhook-id` / `webhook-timestamp` / `webhook-signature` headers. Ascend sends:

| Header | Example | Purpose |
|--------|---------|---------|
| `X-Ascend-Signature` | `t=1657323346,v1=c159a974c8...` | Unix timestamp + hex HMAC |
| `X-Ascend-Request-Timestamp` | `1657323346` | The same Unix timestamp, which is signed |

To verify:

1. **Parse** `X-Ascend-Signature` on commas into key/value pairs, giving `t`
   (the timestamp) and `v1` (the hex-encoded HMAC).
2. **Build the signed string**: `` `${t}:${rawBody}` `` — the timestamp, a
   literal **colon**, then the **raw** request body bytes.
3. **Compute** `HMAC-SHA256(signedString, ASCEND_WEBHOOK_SECRET)` and
   hex-encode it.
4. **Compare** the computed value to `v1` using a **constant-time** comparison.

Ascend's docs read the timestamp from the `X-Ascend-Request-Timestamp` header
and rebuild the whole header as `t=<that timestamp>,v1=<hmac>` before comparing,
so the `t` value inside `X-Ascend-Signature` is the same timestamp. Reading `t`
from the signature header, as these examples do, signs the same string.

## There Is No Official SDK

Ascend does not publish an SDK, so **all frameworks verify manually** using
their standard-library crypto (`crypto` in Node.js, `hmac`/`hashlib` in
Python). The algorithm is identical everywhere.

## Implementation

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyAscendSignature(rawBody, signatureHeader, secret) {
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => p.split('=').map((s) => s.trim()))
  );
  const { t: timestamp, v1: signature } = parts;
  if (!timestamp || !signature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}:${rawBody}`) // colon separator + RAW body
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // hex length mismatch = invalid
  }
}
```

### Python (FastAPI)

```python
import hmac
import hashlib

def verify_ascend_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    parts = {}
    for part in signature_header.split(","):
        key, _, value = part.partition("=")
        parts[key.strip()] = value.strip()

    timestamp = parts.get("t")
    signature = parts.get("v1")
    if not timestamp or not signature:
        return False

    signed = f"{timestamp}:".encode("utf-8") + raw_body  # colon separator + RAW body
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)
```

## Common Gotchas

- **Use the raw body.** Verify against the exact bytes Ascend sent. If you parse
  JSON and re-serialize (`JSON.stringify` / `json.dumps`), key order and
  whitespace change and the HMAC will not match. In Express use
  `express.raw()`; in Next.js use `await request.text()`; in FastAPI use
  `await request.body()`.
- **Colon separator, not a dot.** The signed string is `<timestamp>:<body>`.
  Stripe uses `<timestamp>.<body>` — copying Stripe code verbatim fails here.
- **Hex encoding.** `v1` is hex, not base64. Decode both sides as hex before a
  timing-safe compare (or compare the hex strings directly with
  `hmac.compare_digest`).
- **Constant-time compare.** Use `crypto.timingSafeEqual` /
  `hmac.compare_digest`, never `===`/`==`. Wrap `timingSafeEqual` in try/catch —
  it throws when the two buffers differ in length.
- **Header casing.** HTTP headers are case-insensitive; frameworks often
  lowercase them (`x-ascend-signature`). Look them up case-insensitively.

## Timestamp Tolerance (Not Documented)

Ascend does **not** document a timestamp tolerance or retry schedule. The
`t` value lets you optionally reject very old requests to blunt replay attacks,
but because no official window is published, the examples in this skill do
**not** hard-fail on timestamp age by default. If you add a tolerance check,
pick a generous window (e.g. 5–10 minutes) and confirm expectations with Ascend
before enforcing it in production.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Signature never matches | Body was parsed/re-serialized — use the raw body |
| Signature never matches | Using `.` instead of `:` in the signed string |
| Signature never matches | Decoding `v1` as base64 instead of hex |
| `timingSafeEqual` throws | Buffers differ in length — wrap in try/catch, return false |
| Header is `undefined` | Wrong casing / not reading `X-Ascend-Signature` |
| Works locally, fails in prod | A proxy altered the body; verify before any body middleware |
