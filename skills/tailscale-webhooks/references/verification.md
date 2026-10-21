# How to Verify Tailscale Webhook Signatures

## How It Works

Every request has one header:

```
Tailscale-Webhook-Signature: t=1663781880,v1=0123456789abcdef...
```

- `t` — epoch seconds when the event occurred
- `v1` — hex HMAC-SHA256 (only supported scheme)

Signed string: `"<t>.<raw request body>"`. Key: the webhook secret as a raw UTF-8 string
(do not base64-decode or strip a prefix; `tskey-webhook-xxxxx` is used as is).
This is **not** Standard Webhooks (no `webhook-id` / `webhook-timestamp` headers).

Steps:

1. Split the header on `,`, then each element on `=`, to get `t` and `v1`.
2. Optionally reject if `t` is more than 5 minutes from now (Tailscale's guidance). The examples leave this off by default because retries keep the original `t`; set `TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to opt in. A value that isn't a whole number is treated as `0`, with a warning at startup.
3. Compute `hex(HMAC_SHA256(secret, t + "." + rawBody))`.
4. Compare to `v1` with a constant-time function.

## Implementation

Tailscale ships no verification SDK, so this is manual in every language. See
[examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and
[examples/fastapi/](../examples/fastapi/) for tested versions.

### Node.js

```javascript
const crypto = require('crypto');

// toleranceSeconds = 0 (default) skips the timestamp window; a positive value opts in
function verifyTailscaleWebhook(rawBody, header, secret, toleranceSeconds = 0) {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.split('='));
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

def verify_tailscale_webhook(raw_body: bytes, header: str | None, secret: str, tolerance: int = 0) -> bool:
    # tolerance = 0 (default) skips the timestamp window; a positive value opts in
    if not header:
        return False
    pairs = [p.split("=", 1) for p in header.split(",") if "=" in p]
    t = next((v for k, v in pairs if k == "t"), None)
    sigs = [v for k, v in pairs if k == "v1"]
    if not t or not t.isdigit() or not sigs:
        return False
    if tolerance > 0 and abs(time.time() - int(t)) > tolerance:
        return False
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(s, expected) for s in sigs)
```

## Common Gotchas

- **Raw body**: sign the exact bytes received. Parsing and re-serializing the JSON array breaks the signature.
- **Use `t` verbatim** in the signed string; don't reformat the timestamp.
- **Secret is case-sensitive** and shown only once; a copy-paste with trailing whitespace fails.
- **Always respond 2XX** unless you hit a transient failure. Tailscale treats 3xx/4xx/5xx as failures and retries hourly for 24 hours. Note that rejecting a bad signature with 400 is correct for forged requests.
- **Replay window**: a delayed retry (Tailscale retries hourly) or a Hookdeck retry or replay carries the original `t`, so it fails a 5-minute freshness check. That's why the examples leave the window off unless `TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS` is set.
- **Destination format**: if the endpoint is set to Slack/Discord/etc., the body differs from the general format.
- **Body is an array**, even for a single event.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Parsed body used instead of raw body, or wrong/old secret |
| Invalid only on retries | Timestamp window rejecting hourly retries |
| Header missing | Request not from Tailscale, or a proxy stripped it |
| Invalid after rotation | App still using the previous webhook secret |
