# How to Verify Go1 Webhook Signatures

## How It Works

Every signed request has one header:

```
Go1-Signature: t=1706747802205,v1=a84cb2671c8c2215db331a18304ba98c89e8cc0f95e2e4eec4fa2673f877d786
```

- `t`: Unix time in **milliseconds**
- `v1`: hex HMAC-SHA256

Signed string: `"<t>.<raw request body>"`. Key: the webhook's `secret_key` as a UTF-8 string (no decoding, no prefix stripping). This is **not** Standard Webhooks (no `webhook-id` / `webhook-timestamp` headers).

Steps:

1. Split the header on `,`, then each element on `=`, to get `t` and `v1`.
2. Optionally reject if `t` is too far from now. Remember `t` is milliseconds. The examples leave this off by default because retries keep the original `t`; set `GO1_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to opt in. A value that isn't a whole number is treated as `0`, with a warning at startup.
3. Compute `hex(HMAC_SHA256(secret_key, t + "." + rawBody))`, using `t` exactly as received.
4. Compare to `v1` with a constant-time function.

## Implementation

Go1 documents no verification SDK, so verification is manual in every language. See [examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and [examples/fastapi/](../examples/fastapi/) for tested versions.

### Node.js

```javascript
const crypto = require('crypto');

function verifyGo1Webhook(rawBody, header, secret, toleranceSeconds = 0) {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || sigs.length === 0) return false;
  if (toleranceSeconds > 0 && Math.abs(Date.now() - Number(t)) > toleranceSeconds * 1000) return false;
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

def verify_go1_webhook(raw_body: bytes, header: str | None, secret: str, tolerance: int = 0) -> bool:
    if not header or not secret:
        return False
    pairs = [p.strip().split("=", 1) for p in header.split(",") if "=" in p]
    t = next((v for k, v in pairs if k == "t"), None)
    sigs = [v for k, v in pairs if k == "v1"]
    if not t or not (t.isascii() and t.isdigit()) or not sigs:
        return False
    if tolerance > 0 and abs(time.time() * 1000 - int(t)) > tolerance * 1000:
        return False
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(s, expected) for s in sigs)
```

## Common Gotchas

- **Raw body**: sign the exact bytes received. Parsing and re-serializing the JSON changes whitespace and key order and breaks the signature. In Express use `express.raw({ type: '*/*' })` so any content type verifies.
- **Milliseconds, not seconds**: `t` is Unix milliseconds. Use it verbatim in the signed string. Only divide or multiply when you compare it to the clock.
- **No signature without a secret**: if the webhook has no `secret_key`, there is no `Go1-Signature` header. Require the header whenever you have a secret configured.
- **Secret length**: `secret_key` is at most 64 characters and is used as plain UTF-8 text. Special characters like `#` are part of the key.
- **Replay window**: a Hookdeck retry or replay carries the original `t`, so a freshness check rejects it once the window has passed. That's why the examples leave the window off unless `GO1_TIMESTAMP_TOLERANCE_SECONDS` is set.

## Debugging Verification Failures

- Log the raw body length and `t` and recompute the HMAC by hand with the same secret.
- Check for a body-parsing middleware that runs before the verification route.
- Check for trailing whitespace or quotes in `GO1_WEBHOOK_SECRET`.
- Check that `t` was not converted to seconds before building the signed string.
