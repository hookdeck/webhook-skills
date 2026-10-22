# How to Verify OnceHub Webhook Signatures

## How It Works

Every request from a **v2** webhook has one header:

```
Oncehub-Signature: t=1611144604,s=22b3f46eed16d8a41b492334b626dcf04aca47232102208e2d3424051402adcc
```

- `t`: Unix timestamp in seconds
- `s`: hex HMAC-SHA256

Signed string: `"<t>.<raw request body>"`. Key: the endpoint secret (Webhook & API integration >
**View secret**) as a UTF-8 string. This is **not** Standard Webhooks (no `webhook-id` /
`webhook-timestamp` headers).

**v1 webhooks can't be verified.** If the dashboard doesn't show **View secret** for the webhook, it
is a v1 webhook and sends no signature. Create a new webhook (new ones are v2).

Steps:

1. Split the header on `,`, then each element on `=`, to get `t` and `s`.
2. Optionally reject if `t` is too far from now (see "Timestamp window" below). Off by default.
3. Compute `hex(HMAC_SHA256(secret, t + "." + rawBody))`.
4. Compare to `s` with a constant-time function.

## Implementation

OnceHub ships no verification SDK, so this is manual in every language. See
[examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and
[examples/fastapi/](../examples/fastapi/) for tested versions.

### Node.js

```javascript
const crypto = require('crypto');

// toleranceSeconds = 0 (default) skips the timestamp window; a positive value opts in
function verifyOncehubWebhook(rawBody, header, secret, toleranceSeconds = 0) {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 's').map(([, v]) => v);
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

def verify_oncehub_webhook(raw_body: bytes, header: str | None, secret: str, tolerance: int = 0) -> bool:
    # tolerance = 0 (default) skips the timestamp window; a positive value opts in
    if not header:
        return False
    pairs = [p.split("=", 1) for p in header.split(",") if "=" in p]
    t = next((v for k, v in pairs if k == "t"), None)
    sigs = [v for k, v in pairs if k == "s"]
    if not t or not t.isdigit() or not sigs:
        return False
    if tolerance > 0 and abs(time.time() - int(t)) > tolerance:
        return False
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(s.encode(), expected.encode()) for s in sigs)
```

## Timestamp window

OnceHub's docs say to compare the current time with `t` and decide whether the difference is within
your tolerance, without naming a number. A typical choice is 5 minutes. But Hookdeck retries and
replays resend the original `t` (as do OnceHub's own retries, which continue for about 3 days), so a
5-minute window rejects every late retry and replay.

The examples therefore leave the window **off** and take it from `ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS`
(default `0` = off). Where to change it:

- **Turn it on or widen it**: set `ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS=300` (or larger, e.g. `259200`
  for 3 days to cover OnceHub's retry window) in `.env`. A value that isn't a whole number is treated as
  `0`, with a warning at startup.
- **Drop it in code**: remove the `toleranceSeconds > 0` / `tolerance > 0` line in the verify function
  (`src/index.js`, `lib/oncehub.ts`, `main.py`).
- **Per call**: pass the tolerance argument explicitly (`verifyOncehubWebhook(body, header, secret, 300)`).

If you keep a window while receiving through Hookdeck, measure it from when Hookdeck received the
request rather than from `t`, or make it wide enough for your retry policy. Without a window, use the
event `id` for idempotency so replays are harmless.

## Common Gotchas

- **Raw body**: sign the exact bytes received; don't format or re-serialize the JSON (extra
  whitespace changes the signature). In Express use `express.raw({ type: '*/*' })` so any content
  type is read raw.
- **Use `t` verbatim** in the signed string.
- **Secret as a UTF-8 string**: don't base64-decode it; watch for trailing whitespace on copy-paste.
- **v1 webhooks**: no secret, no header. Missing header on a v1 webhook is not an attack.
- **Return `2xx`** once accepted; rejecting a bad signature with 400 is correct for forged requests.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Parsed body used instead of raw body, or wrong secret |
| Header missing | v1 webhook (no **View secret**), or a proxy stripped it |
| Invalid only on retries/replays | A timestamp window is on and rejecting the original `t` |
| Invalid after creating a new webhook | App still uses the previous webhook's secret (each has its own) |
