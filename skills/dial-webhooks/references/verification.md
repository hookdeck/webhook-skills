# Dial Signature Verification

## How Does Dial Sign Webhooks?

- Header: `X-Dial-Signature: t=<unix-seconds>,v1=<hex>`
- Signed content: `{t}.{raw request body}` (the timestamp, a literal `.`, then the exact body bytes)
- Algorithm: HMAC-SHA256, lowercase hex digest (64 chars)
- Key: the **full** signing secret as a UTF-8 string, **`whsec_` prefix included**.
  This is not the Standard Webhooks scheme: do not strip the prefix or base64-decode it.
- Replay protection: dedupe on `X-Dial-Event-ID`. Dial's docs also suggest rejecting a
  `t` more than 5 minutes from now; the examples make that window opt-in.

## Implementation

Dial has no published webhook verification SDK, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyDialSignature(rawBody, header, secret, toleranceSeconds = 0) {
  let t = null;
  const v1 = [];
  for (const part of String(header || '').split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't') t = value;
    else if (key === 'v1') v1.push(value);
  }
  if (!t || !/^\d{1,12}$/.test(t) || v1.length === 0) return false;
  if (toleranceSeconds > 0 && Math.abs(Date.now() / 1000 - Number(t)) > toleranceSeconds) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest();
  return v1.some((sig) => /^[0-9a-f]{64}$/i.test(sig) && crypto.timingSafeEqual(expected, Buffer.from(sig, 'hex')));
}
```

### Python

```python
import hashlib, hmac, time

def verify(raw_body: bytes, header: str, secret: str, tolerance: int = 0) -> bool:
    parts = [p.split("=", 1) for p in header.split(",") if "=" in p]
    t = next((v.strip() for k, v in parts if k.strip() == "t"), "")
    sigs = [v.strip().lower() for k, v in parts if k.strip() == "v1"]
    # Cap t at 12 digits: a longer int overflows the float math below (a 500, not a 401)
    if not t.isascii() or not t.isdigit() or len(t) > 12 or not sigs:
        return False
    if tolerance > 0 and abs(time.time() - int(t)) > tolerance:
        return False
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest().encode()
    return any(hmac.compare_digest(expected, s.encode()) for s in sigs)
```

Accepting any of several `v1` entries costs nothing today (Dial sends one) and keeps the
verifier working if a future header carries more than one.

## Timestamp Window and Retries

Dial computes a fresh `t` (and signature) on **each** of its own retry attempts, so a
5-minute window never rejects a legitimate direct delivery. Hookdeck retries and
replays forward the original header unchanged, so behind Hookdeck a 5-minute window
rejects anything retried or replayed later than that.

The examples therefore skip the timestamp check by default. Set
`DIAL_WEBHOOK_TOLERANCE_SECONDS` to a positive whole number (e.g. `300`) to turn it on
when Dial delivers to your handler directly. Either way, dedupe on `X-Dial-Event-ID`
for replay safety. The verifiers also reject a `t` longer than 12 digits, which can't
be a real Unix time.

## Common Gotchas

- **Raw body**: Express needs `express.raw({ type: '*/*' })`; Next.js uses `request.text()`; FastAPI uses `await request.body()`. Re-serializing parsed JSON changes the bytes and the signature fails.
- **Sign `{t}.{body}`, not the body alone**: the timestamp and the `.` separator are part of the signed content.
- **Keep the `whsec_` prefix**: the HMAC key is the whole secret string.
- **Validate hex before `Buffer.from(x, 'hex')`**: invalid hex is silently truncated.
- **`timingSafeEqual` throws on length mismatch**: the 64-hex check guards it.
- **Python `compare_digest` with `str`**: raises `TypeError` on non-ASCII input (a 500). Compare bytes.
- **`t` must be digits only**: reject anything else rather than letting `Number()` / `int()` coerce it.

## Debugging Verification Failures

1. Confirm `DIAL_WEBHOOK_SECRET` is the full value from `GET /api/v1/webhooks/{id}/secret`, not `secretMasked`, and belongs to the subscription that sent the delivery.
2. Confirm you hash the raw bytes, prefixed with `{t}.`.
3. Check the server clock and the tolerance (a replayed delivery keeps its old `t`).
4. Fire a `webhook.ping` and log the received header and body.
