# How to Verify Top.gg Webhook Signatures

## How It Works

Every v1 delivery has one signature header:

```
x-topgg-signature: t=1770598034,v1=8f4b1c...e2
```

- `t` — Unix timestamp (seconds) of when the request was signed
- `v1` — lowercase hex HMAC-SHA256. The header may carry more than one `v1` (for example during key rotation), and may carry other keys such as `v0`, which are ignored.

Signed string: `"<t>.<raw request body bytes>"`. Key: the webhook secret (`whs_...`) **used whole** as UTF-8 bytes. `whs_` is part of the key: don't strip it and don't hex- or base64-decode the rest. This is **not** Standard Webhooks (no `webhook-id` / `webhook-timestamp` headers), so the `standardwebhooks` and `svix` libraries will not verify it.

Only v1 webhooks, whose secret starts with whs_, are supported. Legacy v0 webhooks aren't signed and fail verification.

Steps:

1. Split the header on `,` (trim spaces), then each element on the first `=`, to get `t` and every `v1`.
2. Fail if there is no `t` value, or no `v1` that is exactly 64 hex characters (hex is compared case-insensitively, so lowercase it).
3. Compute `hex(HMAC_SHA256(secret, t + "." + rawBodyBytes))`, using `t` exactly as sent.
4. Compare to **each** valid `v1` with a constant-time function; accept if any matches.
5. Answer `401` for a missing or empty header, a malformed value or a mismatch.

## Should I Reject Old Timestamps?

Not by default. Hookdeck retries and replays resend the original headers, including the original `t`, and Hookdeck itself applies no tolerance, so a fixed window would reject legitimate retries. The examples leave the check off. To opt in, set `TOP_GG_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds (`t` is Unix seconds); unset or `0` leaves it off, and a value that isn't a whole number is treated as `0` with a warning at startup. With a window set, a non-numeric `t` fails.

## Implementation

Top.gg ships no verification SDK, so this is manual in every language. See
[examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and
[examples/fastapi/](../examples/fastapi/) for tested versions.

### Node.js

```javascript
const crypto = require('crypto');

// toleranceSeconds = 0 (default) skips the timestamp window; a positive value opts in
function verifyTopGg(rawBody /* Buffer */, header, secret, toleranceSeconds = 0) {
  const pairs = (header || '').split(',').map((p) => {
    const s = p.trim(), i = s.indexOf('=');
    return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
  });
  const t = pairs.find(([k]) => k === 't')?.[1];
  const sigs = pairs.filter(([k, v]) => k === 'v1' && /^[0-9a-f]{64}$/i.test(v)).map(([, v]) => Buffer.from(v.toLowerCase()));
  if (!t || sigs.length === 0) return false;
  if (toleranceSeconds > 0 && (!/^\d+$/.test(t) || Math.abs(Date.now() / 1000 - Number(t)) > toleranceSeconds)) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex'));
  return sigs.some((sig) => crypto.timingSafeEqual(sig, expected));
}
```

### Python

```python
import hashlib, hmac, re, time

HEX64 = re.compile(r"[0-9a-fA-F]{64}")

def verify_top_gg(raw_body: bytes, header: str | None, secret: str, tolerance: int = 0) -> bool:
    # tolerance = 0 (default) skips the timestamp window; a positive value opts in
    pairs = [p.strip().partition("=")[::2] for p in (header or "").split(",")]
    t = next((v for k, v in pairs if k == "t"), None)
    sigs = [v.lower().encode() for k, v in pairs if k == "v1" and HEX64.fullmatch(v)]
    if not t or not sigs:
        return False
    if tolerance > 0 and (not (t.isascii() and t.isdigit()) or abs(time.time() - int(t)) > tolerance):
        return False
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest().encode()
    return any(hmac.compare_digest(s, expected) for s in sigs)
```

## Common Gotchas

- **Raw bytes**: sign exactly what was received. Parsing and re-serializing the JSON changes whitespace and key order and breaks the signature. In Express use `express.raw({ type: '*/*' })`; in Next.js `await request.arrayBuffer()`; in FastAPI `await request.body()`.
- **Whole secret**: `whs_...` is the HMAC key as is. Stripping the prefix or base64-decoding it (the Standard Webhooks habit) makes every signature invalid.
- **Validate before decoding**: `Buffer.from(sig, 'hex')` silently drops bad characters, so check length and alphabet first. In Python compare `bytes` with `hmac.compare_digest`, not `str`.
- **Use `t` verbatim** in the signed string; don't parse it to a number and format it back.
- **Check every `v1`** and ignore other keys such as `v0`.
- **v0 webhooks**: they send the shared secret you chose in `Authorization` and no signature, so they fail this check.

## Debugging Verification Failures

- **Every request fails**: confirm `TOP_GG_WEBHOOK_SECRET` is the `whs_` secret from the project's **Webhooks** page, not a v0 `Authorization` secret, and has no surrounding whitespace.
- **Only some content types fail**: something parsed the body before you read the bytes. Use the raw-body reader above.
- **Fails behind a proxy**: make sure it forwards the body unchanged (no re-compression or re-encoding) and keeps the `x-topgg-signature` header.
- **Quote `x-topgg-trace`** when asking Top.gg support about a delivery.
