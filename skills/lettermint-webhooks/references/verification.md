# How to Verify Lettermint Webhook Signatures

## How It Works

Every request has these headers:

```
X-Lettermint-Signature: t=1704067200,v1=5d41402abc4b2a76b9719d911017c592...
X-Lettermint-Event: message.delivered
X-Lettermint-Delivery: 1704067200
X-Lettermint-Attempt: 1
```

- `t` — Unix timestamp (seconds) when the signature was generated
- `v1` — lowercase hex HMAC-SHA256 (64 characters)

Signed string: `"<t>.<raw request body>"`, built from the `t` text exactly as it appears in the header. Key: the webhook secret **as-is**, including the `whsec_` prefix, as UTF-8 bytes.
This is **not** Standard Webhooks (no `webhook-id` / `webhook-timestamp` headers), so the `standardwebhooks` and `svix` libraries don't apply, and the secret is neither stripped nor base64-decoded.

Paste the whole secret, including the whsec_ prefix. Lettermint uses it as a plain HMAC key.

Steps:

1. Read the raw body bytes before any parsing. Lettermint serializes the JSON with unescaped slashes and unicode, so a parsed-and-re-serialized body won't match.
2. Split the header on `,`, then each element on the first `=`, to get `t` and every `v1`. Ignore other keys (such as `v0`). No `t` means failure.
3. Optionally reject if `t` is too far from now (see below).
4. Compute `HMAC_SHA256(secret, t + "." + rawBody)` over bytes.
5. For each `v1`: require exactly 64 hex characters, then compare in constant time (hex is case-insensitive). Accept if any `v1` matches. During key rotation the header can carry several.
6. On a missing header, malformed value or mismatch respond `401`.

## Implementation

Lettermint's SDKs have a `Webhook.verify()` helper (for example `new Webhook(secret).verify(rawBody, headers)` in the Node.js SDK). It also requires `X-Lettermint-Delivery` to equal `t` and rejects deliveries more than 300 seconds off by default. Hookdeck verifies only the signature, so the examples here do the same by hand: [examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and [examples/fastapi/](../examples/fastapi/).

### Node.js

```javascript
const crypto = require('crypto');

function verifyLettermintWebhook(rawBody, header, secret, toleranceSeconds = 0) {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t) return false;
  if (toleranceSeconds > 0 && !(/^\d+$/.test(t) && Math.abs(Date.now() / 1000 - Number(t)) <= toleranceSeconds)) return false;
  const expected = crypto.createHmac('sha256', secret).update(Buffer.from(`${t}.`, 'latin1')).update(rawBody).digest();
  return sigs.some((sig) => /^[0-9a-fA-F]{64}$/.test(sig) && crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected));
}
```

`Buffer.from(sig, 'hex')` is only called after the length and alphabet check, because it silently drops bad characters.

### Python

```python
import hashlib, hmac, re, time

HEX64 = re.compile(r"[0-9a-fA-F]{64}")

def verify_lettermint_webhook(raw_body: bytes, header: str | None, secret: str, tolerance: int = 0) -> bool:
    if not header or not secret:
        return False
    pairs = [p.strip().split("=", 1) for p in header.split(",") if "=" in p]
    t = next((v for k, v in pairs if k == "t"), None)
    sigs = [v for k, v in pairs if k == "v1"]
    if not t:
        return False
    if tolerance > 0 and not (t.isascii() and t.isdigit() and abs(time.time() - int(t)) <= tolerance):
        return False
    expected = hmac.new(secret.encode("utf-8"), t.encode("latin-1", "replace") + b"." + raw_body, hashlib.sha256).digest()
    return any(HEX64.fullmatch(s) and hmac.compare_digest(bytes.fromhex(s), expected) for s in sigs)
```

## Common Gotchas

- **Raw body.** Use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` or `await request.body()`. Never `JSON.parse` then `JSON.stringify` before verifying.
- **Whole secret.** Keep `whsec_`. Stripping it or base64-decoding the rest gives a different key and every check fails.
- **Timestamp window is opt-in.** Lettermint's docs recommend `|now - t| <= 300` seconds, and its SDKs enforce it. Retries (12 attempts over about 14 hours) and Hookdeck replays keep the original `t`, and Hookdeck applies no tolerance, so a fixed window would reject legitimate redeliveries. Set `LETTERMINT_WEBHOOK_TOLERANCE_SECONDS` to a positive whole number to opt in (`300` matches the SDKs); unset or `0` leaves it off. With the window on, `t` must be a Unix-seconds integer. Whatever you choose, dedupe on the envelope `id`: a valid signature doesn't stop a repeated delivery.
- **`X-Lettermint-Delivery` is not checked.** The SDKs require it to equal `t`; the examples don't.
- **Multiple `v1` values.** Accept if any matches.
- **Status codes.** Lettermint doesn't retry `401`, so a wrong secret surfaces in the dashboard's delivery log rather than as retries.

## Debugging Verification Failures

- Everything fails: check `LETTERMINT_WEBHOOK_SECRET` includes `whsec_` and is the secret of this webhook (changing the secret invalidates the old one at once).
- Test works, production fails: a proxy or middleware is modifying or re-encoding the body (compression, `express.json()` ahead of your route).
- Fails only with the window on: check the server clock (NTP) and that `t` is parsed as Unix seconds.
- Reproduce with a known-bad request: `curl -X POST <url> -H "X-Lettermint-Signature: t=1704067200,v1=invalid" -d '{"id":"test","event":"webhook.test","data":{}}'` should return `401`.
