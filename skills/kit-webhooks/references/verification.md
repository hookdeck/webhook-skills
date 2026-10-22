# How to Verify Kit Webhook Signatures

## How It Works

Every delivery from a webhook endpoint has one signature header:

```
X-Kit-Signature: t=1753797130,v1=8f4b1c...e2
```

- `t` — Unix timestamp (seconds) of when this POST was signed
- `v1` — hex HMAC-SHA256. During secret rotation the header carries one `v1` per valid secret:
  `t=1753797130,v1=<new>,v1=<old>`

Signed string: `"<t>.<raw request body>"`. Key: the endpoint secret **used whole** as UTF-8 bytes.
`whsec_` is part of the key: don't strip it and don't base64-decode the rest. This is **not**
Standard Webhooks (no `webhook-id` / `webhook-timestamp` headers), so the `standardwebhooks` and
`svix` libraries will not verify it. Legacy `/v4/webhooks` deliveries carry no signature at all.

Steps:

1. Split the header on `,` (trim spaces), then each element on `=`, to get `t` and every `v1`.
2. Optionally reject if `t` is more than 5 minutes from now (Kit's guidance). The examples leave this off by default because Hookdeck retries and replays keep the original `t`; set `KIT_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to opt in. A value that isn't a whole number is treated as `0`, with a warning at startup.
3. Compute `hex(HMAC_SHA256(secret, t + "." + rawBody))`.
4. Compare to **each** `v1` with a constant-time function; accept if any matches.

## Implementation

Kit ships no verification SDK, so this is manual in every language. See
[examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and
[examples/fastapi/](../examples/fastapi/) for tested versions.

### Node.js

```javascript
const crypto = require('crypto');

// toleranceSeconds = 0 (default) skips the timestamp window; a positive value opts in
function verifyKitWebhook(rawBody, header, secret, toleranceSeconds = 0) {
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

def verify_kit_webhook(raw_body: bytes, header: str | None, secret: str, tolerance: int = 0) -> bool:
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
    return any(hmac.compare_digest(s, expected) for s in sigs)
```

## Common Gotchas

- **Raw body**: sign the exact bytes received. Parsing and re-serializing the JSON changes whitespace and key order and breaks the signature. In Express use `express.raw({ type: '*/*' })`.
- **Whole secret**: `whsec_...` is the HMAC key as is. Stripping the prefix or base64-decoding it (the Standard Webhooks habit) makes every signature invalid.
- **Check every `v1`**: during a rotation window the header has two. Verifying only the first breaks if your app still has the other secret.
- **Use `t` verbatim** in the signed string; don't reformat the timestamp.
- **Secret shown once**: Kit never returns it again. A copy-paste with trailing whitespace fails.
- **Replay window**: Kit re-signs its own retries with a fresh `t`, but a Hookdeck retry or replay re-sends the original request with the original `t`, so it fails a 5-minute freshness check. That's why the window is off unless `KIT_TIMESTAMP_TOLERANCE_SECONDS` is set.
- **Deduplicate on event `id`**, not `delivery_id`: a re-emitted event can arrive in a different delivery.
- **Always iterate `events`**: a delivery carries 1 to 100 events.
- **Legacy webhooks** (`/v4/webhooks`) are unsigned; recreate them as webhook endpoints to get verification.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Parsed body used instead of raw body, or wrong/old secret |
| Always invalid, secret looks right | `whsec_` prefix stripped or the secret base64-decoded |
| Invalid only after rotating | Verifier only checks the first `v1`, or app still on the previous secret after the window closed |
| Invalid only on retries/replays | Timestamp window rejecting the original `t` |
| Header missing | Legacy `/v4/webhooks` webhook (unsigned), or a proxy stripped it |
