# Knock Signature Verification

## How It Works

Knock signs each outbound webhook with HMAC-SHA256. The signature travels in a single request header:

| Header | Value |
|--------|-------|
| `x-knock-signature` | `t=<timestamp_ms>,s=<base64_signature>` |

- `t=` — the timestamp at which Knock generated the signature, in **milliseconds since the Unix epoch**.
- `s=` — base64-encoded HMAC-SHA256 of `${timestamp_ms}.${raw_body}` using your endpoint's signing secret.

## ⚠️ Critical: Milliseconds, not seconds

> Knock's timestamp is in **milliseconds**. Stripe's `Stripe-Signature` header looks identical but uses **seconds**. If you copy a Stripe verifier without changing the unit, **every Knock signature check will silently fail** — the timestamp is wrong by a factor of 1,000, both inside the HMAC input string and in the freshness check.

The recommended replay window is **5 minutes** (`300_000` milliseconds). Reject any payload whose `t=` timestamp is older than that.

## How to Verify

### No SDK helper is available

The official Knock SDKs (`@knocklabs/node` on npm, `knockapi` on PyPI) do **not** ship an inbound webhook verification helper as of v1.32.0 / v1.25.0 respectively. There is no `webhooks.unwrap()` / `constructEvent()` / `verify()` to reach for. Verify with the standard library — do not pull in a third-party verifier.

### Node.js / Express / Next.js

```javascript
const crypto = require('crypto');

function verifyKnockSignature(rawBody, header, secret, toleranceMs = 5 * 60 * 1000) {
  if (!header) return { valid: false, error: 'Missing x-knock-signature header' };

  // Header format: t=<timestamp_ms>,s=<base64_signature>
  const parts = header.split(',');
  const tPart = parts.find((p) => p.startsWith('t='));
  const sPart = parts.find((p) => p.startsWith('s='));
  const timestampMs = tPart ? tPart.slice(2) : null;
  const signature = sPart ? sPart.slice(2) : null;

  if (!timestampMs || !signature) {
    return { valid: false, error: 'Malformed x-knock-signature header' };
  }

  // Replay protection — Knock timestamp is in MILLISECONDS, not seconds
  const ts = parseInt(timestampMs, 10);
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > toleranceMs) {
    return { valid: false, error: 'Timestamp outside tolerance' };
  }

  // Signed content: `${timestamp_ms}.${raw_body}`
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestampMs}.${rawBody}`)
    .digest('base64');

  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return { valid: false, error: 'Invalid signature' };
  return crypto.timingSafeEqual(a, b)
    ? { valid: true }
    : { valid: false, error: 'Invalid signature' };
}
```

### Python / FastAPI

```python
import base64
import hashlib
import hmac
import time


def verify_knock_signature(
    raw_body: bytes,
    header: str | None,
    secret: str,
    tolerance_ms: int = 5 * 60 * 1000,
) -> bool:
    """Verify Knock's x-knock-signature header.

    Header format: t=<timestamp_ms>,s=<base64_signature>
    Signed content: f"{timestamp_ms}.{raw_body_str}"
    Timestamp is MILLISECONDS, not seconds (Knock deviates from Stripe).
    """
    if not header:
        return False

    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    timestamp_ms = parts.get("t")
    signature = parts.get("s")
    if not timestamp_ms or not signature:
        return False

    try:
        ts = int(timestamp_ms)
    except ValueError:
        return False

    now_ms = int(time.time() * 1000)
    if abs(now_ms - ts) > tolerance_ms:
        return False

    signed_content = f"{timestamp_ms}.{raw_body.decode('utf-8')}"
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), signed_content.encode("utf-8"), hashlib.sha256).digest()
    ).decode("utf-8")

    return hmac.compare_digest(signature, expected)
```

## Common Gotchas

### 1. Raw body required

The HMAC is computed over the exact bytes Knock sent. If your framework parses JSON before you verify, the re-serialized form will differ (whitespace, key order, escaping) and the signature will not match.

**Express:** mount `express.raw({ type: 'application/json' })` on the webhook route specifically. Do not rely on a global `express.json()` middleware.

**Next.js (App Router):** read the body with `await request.text()` — do **not** call `await request.json()` first. App Router does not pre-parse JSON, but you must avoid both calls.

**FastAPI:** read with `await request.body()` (returns `bytes`). Do not declare a Pydantic model parameter on the route — that triggers parsing.

### 2. Milliseconds vs seconds

Already covered above, but worth repeating: Knock's `t=` value is in **milliseconds**. Stripe's superficially identical `t=` is in **seconds**. Anyone porting a Stripe verifier needs to change:

1. The freshness check (`Date.now() - ts < 5 * 60 * 1000`, not `Date.now() / 1000 - ts < 300`).
2. The string fed into HMAC (use `${timestampMs}.${body}`, not `${timestampSeconds}.${body}`).

### 3. The secret is the per-endpoint signing secret, not the API key

The signing secret is shown on each webhook endpoint's detail page in the Knock dashboard. It is distinct from your Knock account API key. Each endpoint has its own secret; rotating one does not affect the others.

### 4. Timing-safe comparison

Always use `crypto.timingSafeEqual` (Node) or `hmac.compare_digest` (Python). Plain `===` / `==` leaks signature bytes via timing side-channels. Pre-check the buffer lengths before calling `timingSafeEqual` — it throws on length mismatch.

### 5. 5-minute replay window

Knock's documentation recommends rejecting payloads older than 5 minutes. Apply this on top of the signature check. If your server clock is off by more than a few seconds, verification will start failing — sync clocks via NTP.

## Debugging Verification Failures

1. **Log the parts you're working with** (do not log the secret):
   ```
   header: t=1715693400000,s=Ab12...
   timestamp_ms (parsed): 1715693400000
   now_ms: 1715693405123 (delta: 5123ms)
   raw_body length: 412
   ```
2. **Confirm the body is raw bytes, not a parsed/re-serialized object.** Log `typeof body` (should be string in Node, `bytes` in Python) and `body.length`.
3. **Confirm the secret has no surrounding whitespace.** A trailing newline in `.env` is a classic source of failure.
4. **Confirm the timestamp unit.** If `now - ts` is in the millions of seconds, you're parsing Knock's milliseconds as seconds — multiply by 1,000 (or stop dividing).
5. **Re-run the HMAC by hand** with the logged values to confirm the algorithm and encoding match.

## Full Documentation

Knock's official webhook overview (signature scheme, retry policy, event taxonomy):
<https://docs.knock.app/developer-tools/outbound-webhooks/overview>
