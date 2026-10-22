# How to Verify Medusa Webhook Signatures

## How It Works

Every request has one signature header:

```
X-Medusa-Signature: t=1786785262,v1=5e9b41...
```

- `t` — Unix timestamp in seconds when Medusa signed the request
- `v1` — hex HMAC-SHA256

Signed string: `"<t>.<raw request body>"`. Key: the endpoint's signing secret as a UTF-8 string (no decoding, no prefix stripping). This is **not** Standard Webhooks (no `webhook-id` / `webhook-timestamp` headers).

Steps:

1. Split the header on `,`, then each element on `=`, to get `t` and `v1`.
2. Optionally reject a stale `t` (see below). Off by default in the examples.
3. Compute `hex(HMAC_SHA256(secret, t + "." + rawBody))`.
4. Compare to `v1` with a constant-time function (check lengths first or catch the length error).

## Implementation

Medusa documents a manual Node.js check and has no verification SDK, so this is manual in every language. See [examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and [examples/fastapi/](../examples/fastapi/) for tested versions.

### Node.js

```javascript
const crypto = require('crypto');

// toleranceSeconds = 0 (default) skips the timestamp window; a positive value opts in
function verifyMedusaWebhook(rawBody, header, secret, toleranceSeconds = 0) {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || sigs.length === 0) return false;
  if (toleranceSeconds > 0 && Math.abs(Date.now() / 1000 - Number(t)) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex');
  return sigs.some((sig) => {
    try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); }
    catch { return false; }
  });
}
```

### Python

```python
import hashlib, hmac, time

def verify_medusa_webhook(raw_body: bytes, header: str | None, secret: str, tolerance: int = 0) -> bool:
    # tolerance = 0 (default) skips the timestamp window; a positive value opts in
    if not header:
        return False
    pairs = [p.strip().split("=", 1) for p in header.split(",") if "=" in p]
    t = next((v for k, v in pairs if k == "t"), None)
    sigs = [v for k, v in pairs if k == "v1"]
    if not t or not t.isdigit() or not sigs:
        return False
    if tolerance > 0 and abs(time.time() - int(t)) > tolerance:
        return False
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(s.encode(), expected.encode()) for s in sigs)
```

## Where Can the Timestamp Window Be Dropped or Widened?

Medusa's docs show an optional `isRecent` helper with a 300-second default. Medusa signs every delivery attempt at the moment it sends it, so Medusa's own retries pass that check. **Hookdeck retries and replays resend the stored request, including the original `X-Medusa-Signature`, so a 5-minute window rejects any retry or replay that happens later than that.**

In the examples the window lives in one place: the `toleranceSeconds` / `tolerance` argument of the verify function, whose default is read from `MEDUSA_TIMESTAMP_TOLERANCE_SECONDS`.

- **Dropped (default)**: leave `MEDUSA_TIMESTAMP_TOLERANCE_SECONDS` unset or `0`. Rely on the event `id` for idempotency.
- **Widened**: set it to a number of seconds longer than your longest retry or replay delay (e.g. `86400` to cover Medusa's 24-hour retry horizon plus Hookdeck replays of the same day).
- **Standard 5 minutes**: set `300`, only if requests reach your handler directly from Medusa and you never replay.

A value that isn't a whole number of seconds is treated as `0`, with a warning at startup.

## Common Gotchas

- **Raw body**: sign the exact bytes received. In Express use `express.raw({ type: '*/*' })` so any content type is read as a Buffer; parsing and re-serializing JSON breaks the signature. In a Medusa app route, enable `bodyParser: { preserveRawBody: true }` and use `req.rawBody`.
- **Use `t` verbatim** in the signed string.
- **Secret rotation is immediate**: the old secret stops working the moment you rotate, so deliveries fail until `MEDUSA_WEBHOOK_SECRET` is updated.
- **Always respond 2xx within ten seconds**; Medusa doesn't follow redirects, and a `3xx` is a failed delivery. Do slow work asynchronously.
- **Duplicates**: the same event `id` (and `X-Medusa-Delivery`) is reused across retries, so deduplicate on it.
- **One endpoint per organization**: events from every project and environment arrive at the same URL; route using `data.project` and `data.environment`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Parsed body used instead of raw body, or wrong/old secret |
| Invalid right after rotating | App still using the previous signing secret |
| Invalid only on retries or replays | Timestamp window enabled and `t` is older than the tolerance |
| Header missing | Request not from Medusa, or a proxy stripped it |
