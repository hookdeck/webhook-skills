# How to Verify WorkOS Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL. Anyone can POST to it. Verifying the
`WorkOS-Signature` header proves the request genuinely came from WorkOS and that
the body wasn't tampered with in transit. Never trust the payload before the
signature checks out.

## How It Works

WorkOS sends a `WorkOS-Signature` header shaped like:

```
WorkOS-Signature: t=1720000000000, v1=6f2c...hexdigest
```

- `t` — the **timestamp in milliseconds** since the Unix epoch (`Date.now()`).
- `v1` — an **HMAC-SHA256** signature, **hex** encoded.

To verify:

1. Parse `t` and `v1` from the header.
2. Build the signed content: `` `${t}.${rawBody}` `` (timestamp, a literal `.`,
   then the exact raw request body bytes).
3. Compute `HMAC-SHA256(signedContent, signingSecret)` and hex-encode it.
4. Compare your computed digest to `v1` using a **timing-safe** comparison.
5. Reject if `t` is older than the tolerance window (default **180000 ms /
   3 minutes**) to block replay attacks.

## Implementation

### SDK Verification (Node.js — preferred)

The `@workos-inc/node` SDK verifies **and** parses in one call. `constructEvent`
is async and throws `SignatureVerificationException` on any failure (bad
signature, malformed header, or stale timestamp).

```javascript
const { WorkOS } = require('@workos-inc/node');
const workos = new WorkOS(process.env.WORKOS_API_KEY);

const event = await workos.webhooks.constructEvent({
  payload: rawBody,                          // string or Buffer — the RAW body
  sigHeader: req.headers['workos-signature'],
  secret: process.env.WORKOS_WEBHOOK_SECRET,
  // tolerance: 180000,                       // optional, milliseconds (default 3 min)
});

// event.event → type string, event.data → object, event.id → event id
```

### Manual Verification (fallback for unsupported frameworks)

Use this when the Node SDK doesn't fit — e.g. Python/FastAPI. It reproduces the
exact algorithm WorkOS uses.

```python
import hmac, hashlib, time

def verify_workos_signature(raw_body: bytes, header: str, secret: str,
                            tolerance_ms: int = 180_000) -> bool:
    # header: "t=<ms>, v1=<hex>"
    parts = {}
    for piece in header.split(","):
        key, _, value = piece.strip().partition("=")
        parts[key] = value
    timestamp, signature = parts.get("t"), parts.get("v1")
    if not timestamp or not signature:
        return False

    # Reject stale timestamps (milliseconds!)
    if int(time.time() * 1000) - int(timestamp) > tolerance_ms:
        return False

    signed_content = f"{timestamp}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed_content, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

The WorkOS **Python SDK** also ships `workos.webhooks.construct_event(...)`; the
manual approach above is shown because it's dependency-free and makes the
algorithm explicit.

## Common Gotchas

- **Use the raw body, not parsed JSON.** The signature is over the exact bytes.
  If you `JSON.parse` and re-serialize, whitespace/key-order changes break the
  HMAC. In the Node SDK, passing a parsed **object** to `constructEvent` makes it
  call `JSON.stringify` internally — pass the raw string/Buffer instead.
- **The timestamp is in milliseconds**, not seconds (unlike Stripe). Compare
  against `Date.now()` / `time.time() * 1000`.
- **Header key is `WorkOS-Signature`.** HTTP header lookups are
  case-insensitive; in Node/Express read `req.headers['workos-signature']`.
- **The header may contain a space after the comma** (`t=..., v1=...`). Trim each
  part before splitting on `=`.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` /
  `hmac.compare_digest`, and guard against length mismatches.
- **Signature is hex**, not base64.

## How to Debug Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Signature never matches | Body was parsed/re-serialized before verifying — use the raw body |
| Always "timestamp outside tolerance" | Comparing seconds vs milliseconds, or server clock skew |
| `Signature or timestamp missing` | Header not forwarded by a proxy, or wrong header name |
| Works locally, fails behind a proxy | Proxy altered the body (compression, re-encoding) — verify before any body middleware |
| Intermittent failures | Wrong endpoint's signing secret (each endpoint has its own) |
