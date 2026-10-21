# How to Verify MaintainX Webhook Signatures

## How It Works

Every MaintainX webhook request carries two headers, each in the form `t=<timestamp>,v1=<signature>`:

- `x-maintainx-webhook-body-signature`: signs the request body
- `x-maintainx-webhook-uri-signature`: same format, signs the full URI

To verify the body signature:

1. Split the header on `,`, then each element on `=`. `t` is the timestamp, `v1` the signature; ignore other prefixes.
2. Build the signed string `{t}.{raw body}`.
3. Compute `HMAC-SHA256` with the webhook's secret as the key and hex-encode it.
4. Compare to `v1` with a timing-safe comparison.
5. Optionally reject if `|now - t|` exceeds a tolerance (MaintainX recommends 5 minutes). The examples leave this off by default because retries and replays carry the original timestamp; set `MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to opt in. A value that isn't a whole number is treated as `0`, with a warning at startup.

The secret comes from **Settings > Integrations > Copy secret** and is used as a raw string. MaintainX publishes no verification SDK, so the examples verify manually.

## Implementation

### Manual Verification (all frameworks)

```javascript
const crypto = require('crypto');

// toleranceSec = 0 (default) skips the timestamp window; a positive value opts in
function verifyMaintainxSignature(rawBody, header, secret, toleranceSec = 0) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const { t: timestamp, v1: signature } = parts;
  if (!timestamp || !signature) return false;
  if (!/^\d+$/.test(timestamp)) return false;
  if (toleranceSec > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSec) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
```

Python equivalent:

```python
import hashlib, hmac, time

def verify_maintainx_signature(raw_body: bytes, header: str, secret: str, tolerance: int = 0) -> bool:
    # tolerance = 0 (default) skips the timestamp window; a positive value opts in
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    timestamp, signature = parts.get("t"), parts.get("v1")
    if not timestamp or not signature or not (timestamp.isascii() and timestamp.isdigit()):
        return False
    if tolerance > 0 and abs(time.time() - int(timestamp)) > tolerance:
        return False
    expected = hmac.new(secret.encode(), timestamp.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)
```

## Common Gotchas

- **Use the raw body.** Re-serialized JSON changes bytes and breaks the signature. Express needs `express.raw({ type: '*/*' })`, Next.js `request.text()`, FastAPI `await request.body()`.
- **Header names are lowercase** in Node and Starlette (`x-maintainx-webhook-body-signature`).
- **Secret is a raw string.** Don't base64-decode it or strip a prefix.
- **Verify the body header, not the URI header.** The URI signature signs the URL instead of the payload, so it won't match the body.
- **Retries and the timestamp window.** A retry or replay (for example from Hookdeck or a queue) keeps the original timestamp, so it fails a 5-minute window. That's why the examples leave the window off unless you set it.
- **Several `v` schemes.** Only `v1` is currently valid. Ignore other prefixes.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Wrong secret (copied from another webhook), or body parsed before verifying |
| Invalid only on some requests | Different webhooks have different secrets; one secret per webhook |
| Invalid after proxying | A proxy or middleware modified the body (gzip, re-encoding) |
| Timestamp rejected | Server clock drift, or replayed/delayed request |
