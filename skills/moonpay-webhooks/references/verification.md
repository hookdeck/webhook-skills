# How to Verify MoonPay Webhook Signatures

## How It Works

Every request has a `Moonpay-Signature-V2` header:

```
Moonpay-Signature-V2: t=1492774577,s=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

- `t`: Unix timestamp in seconds
- `s`: lowercase hex HMAC-SHA256

Signed string: `"<t>.<raw request body>"`. Key: your webhook API key (Developers page, e.g. `wk_test_...`) as a string. MoonPay also sends the legacy `Moonpay-Signature` header; verify `Moonpay-Signature-V2`. This is **not** Standard Webhooks.

**POST webhooks only.** For GET callbacks MoonPay signs the search string (e.g. `?externalCustomerId=...`) instead of a body. That is not covered by these examples.

Steps:

1. Split the header on `,`, then each element on `=`, to get `t` and `s`.
2. Optionally reject if `t` is too old (off by default, see below).
3. Compute `hex(HMAC_SHA256(apiKey, t + "." + rawBody))`.
4. Compare to `s` with a constant-time function; return `400` for a missing header, missing `t`/`s`, or mismatch.

## Implementation

MoonPay's docs show manual verification (no verification SDK is needed). See
[examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and
[examples/fastapi/](../examples/fastapi/) for tested versions.

### Node.js

```javascript
const crypto = require('crypto');

// toleranceSeconds = 0 (default) skips the timestamp window; a positive value opts in
function verifyMoonpayWebhook(rawBody, header, apiKey, toleranceSeconds = 0) {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const s = parts.find(([k]) => k === 's')?.[1];
  if (!t || !/^\d+$/.test(t) || !s) return false;
  if (toleranceSeconds > 0 && Math.abs(Date.now() / 1000 - Number(t)) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', apiKey).update(`${t}.`).update(rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)); }
  catch { return false; }
}
```

### Python

```python
import hashlib, hmac, time

def verify_moonpay_webhook(raw_body: bytes, header: str | None, api_key: str, tolerance: int = 0) -> bool:
    # tolerance = 0 (default) skips the timestamp window; a positive value opts in
    if not header:
        return False
    pairs = [p.split("=", 1) for p in header.split(",") if "=" in p]
    t = next((v for k, v in pairs if k == "t"), None)
    s = next((v for k, v in pairs if k == "s"), None)
    if not t or not t.isdigit() or not s:
        return False
    if tolerance > 0 and abs(time.time() - int(t)) > tolerance:
        return False
    expected = hmac.new(api_key.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(s.encode(), expected.encode())
```

## Where the Timestamp Window Goes (and Why It Is Off by Default)

A freshness check (for example 5 minutes) is a common replay defense, but **Hookdeck retries and replays resend the original request, including the original `t`**. A 5-minute window therefore rejects every retry or replay that happens later, and MoonPay's own retries span longer than that if your endpoint is down.

The examples make the window opt-in with `MOONPAY_TIMESTAMP_TOLERANCE_SECONDS` (default `0` = off; a non-numeric value is treated as `0` with a warning):

- **Drop it**: leave the variable unset or `0` (the default). Rely on idempotency (`type` + `data.id` + `data.updatedAt`, or the `webhook-id` header on Platform events) for replay protection.
- **Widen it**: set a positive number of seconds that covers your retry horizon, e.g. `86400`.
- **Tighten it**: set `300` only when MoonPay delivers straight to your handler and nothing retries or replays.

In code, it is the `toleranceSeconds` / `tolerance` argument of the verify function.

## Common Gotchas

- **Raw body**: sign the exact bytes. Parsing and re-serializing JSON breaks the signature. In Express use `express.raw({ type: '*/*' })` so any content type reaches the verifier as a Buffer.
- **Use `t` verbatim** in the signed string.
- **Right key per mode**: test and live endpoints have different keys.
- **Missing `Moonpay-Signature-V2`**: you may only see the legacy `Moonpay-Signature` if a proxy dropped headers; do not fall back to it.
- **GET callbacks** sign the query string, not the body.
- **Respond within 5 seconds** with a 2xx; do heavy work after responding.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Parsed body used instead of raw body, or wrong key (test vs live) |
| Invalid only on retries/replays | Timestamp window enabled and `t` is old |
| Header missing | Request not from MoonPay, or a proxy stripped it |
| Invalid on GET requests | GET callbacks sign the search string, not a body |
