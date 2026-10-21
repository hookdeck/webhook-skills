# How to Verify Mux Webhook Signatures

## How It Works

Every Mux webhook includes a `mux-signature` header:

```text
mux-signature: t=1565220904,v1=20c75c1180c701ee8a796e81507cfd5c932fc17cf63a4a55566fd38da3a2d3d2
```

- `t` — Unix timestamp in **seconds** when Mux signed the request
- `v1` — the signature. Schemes start with `v` plus an integer; `v1` is currently the only valid scheme.

To verify:

1. Split the header on `,` and read the `t` and `v1` values.
2. Build the signed payload: `<t>` + `.` + `<raw request body>`.
3. Compute **HMAC-SHA256** of the signed payload with your endpoint's signing secret, hex-encoded.
4. Compare it with `v1` using a constant-time comparison.
5. Check the timestamp is within tolerance. Mux SDKs default to **5 minutes** (300 seconds).

This is not Standard Webhooks: there are no `webhook-id` / `webhook-timestamp` / `webhook-signature` headers and the secret is used as-is (no `whsec_` prefix or base64 decoding).

## Implementation

### SDK Verification (Node.js / TypeScript)

The official TypeScript SDK is [`@mux/ts`](https://www.npmjs.com/package/@mux/ts). It was previously published as `@mux/mux-node`, which is now deprecated; the webhook API is identical.

```bash
npm install @mux/ts
```

```javascript
const Mux = require('@mux/ts').default;

// No API token needed just to verify webhooks.
// The client also reads MUX_WEBHOOK_SECRET from the environment by default.
const mux = new Mux({ webhookSecret: process.env.MUX_WEBHOOK_SECRET });

// Verify and parse in one step. `rawBody` must be a string, Buffer/Uint8Array,
// or ArrayBuffer of the raw body; `headers` can be a plain object or a Headers instance.
const event = await mux.webhooks.unwrap(rawBody, headers);

// Or verify only (throws on failure, returns nothing):
await mux.webhooks.verifySignature(rawBody, headers);
```

Both methods are **async** (they use Web Crypto) and throw an `Error` when:

- No secret is configured
- The `mux-signature` header is missing
- The header has no `t=` value or no `v1=` signature
- No `v1` signature matches the expected HMAC
- The timestamp is more than 300 seconds old

The body passed to `unwrap` must be the raw body; passing a parsed object throws `Webhook body must be the raw request body (string or bytes), not parsed JSON.`

### Manual Verification (Python and other languages)

The Mux Python SDK (`mux-python`) does **not** include a webhook verification helper, so verify manually:

```python
import hashlib
import hmac
import time


def verify_mux_signature(raw_body: bytes, header: str | None, secret: str, tolerance: int = 300) -> bool:
    if not header:
        return False

    timestamp = None
    signatures = []
    for part in header.split(","):
        key, _, value = part.strip().partition("=")
        if key == "t":
            timestamp = value
        elif key == "v1":
            signatures.append(value)

    if not timestamp or not timestamp.isdigit() or not signatures:
        return False
    if abs(time.time() - int(timestamp)) > tolerance:
        return False

    signed_payload = timestamp.encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, sig) for sig in signatures)
```

Node.js equivalent with `crypto`:

```javascript
const crypto = require('crypto');

function verifyMuxSignature(rawBody, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries((header || '').split(',').map((p) => p.trim().split('=', 2)));
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSec) return false;

  const expected = crypto.createHmac('sha256', secret)
    .update(`${parts.t}.${rawBody}`)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

## Common Gotchas

- **Raw body only.** The signature covers the exact bytes Mux sent. Parsing JSON and re-serializing it changes whitespace and key order and breaks verification. In Express use `express.raw({ type: '*/*' })` on the webhook route; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Secret per endpoint.** Each webhook URL has its own signing secret. Using the secret from another endpoint, another environment, or the Mux CLI's forwarding secret against real deliveries fails every time.
- **API-created secrets are shown once.** If you created the webhook with the API and lost `signing_secret`, delete and recreate the webhook.
- **Timestamp is in seconds**, not milliseconds.
- **Not the API token.** The webhook signing secret is unrelated to `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET`.
- **SDK only checks for stale timestamps.** `@mux/ts` rejects timestamps older than 5 minutes but not timestamps in the future. The manual examples check both directions; adjust if your server clock is skewed.
- **Header casing.** The docs show `Mux-Signature`; HTTP headers are case-insensitive. Express and Next.js lowercase them (`mux-signature`).
- **SDK methods are async.** Forgetting `await` on `unwrap()` / `verifySignature()` lets invalid requests through as an unhandled rejection.

## Debugging Verification Failures

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Every request fails | Wrong secret (another endpoint/environment, or the API token) | Copy the signing secret for this exact webhook from **Settings → Webhooks** |
| Fails in your app but works in tests | Body was parsed before verification | Mount the raw-body parser on the webhook route before any JSON parser |
| `Webhook timestamp is too old` | Replayed old delivery, or server clock skew | Sync the clock (NTP); for replays from a queue, verify on receipt, not later |
| `Could not find a mux-signature header` | Proxy stripped the header, or request isn't from Mux | Check proxy config; log incoming header names |
| Works with Mux CLI, fails in production | Using the CLI forwarding secret | Use the Dashboard secret for production deliveries |
