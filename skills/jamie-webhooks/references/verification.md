# Jamie Webhook Signature Verification

## How Does Jamie Sign Webhooks?

Header (Signature Verification mode): `x-jamie-signature: t=1234567890,v0=5f3d8a7b...`

- Algorithm: HMAC-SHA256, output as **lowercase hex**
- Key: the signing secret string's UTF-8 bytes, as-is. It is **not decoded**.
- Signed message: `"<t>.<raw request body>"` (`t` is Unix seconds)

```javascript
const expected = crypto.createHmac('sha256', secret)
  .update(`${t}.`).update(rawBody).digest('hex');
```

Parse the header by splitting on `,` and each part on the first `=`. Accept any `v0` entry. Compare in constant time, with a length check first (`timingSafeEqual` throws on different lengths). Missing or malformed header, or a mismatch: respond `401`.

## Standalone Manual Verifier (no timestamp window)

Node.js:

```javascript
const crypto = require('crypto');

function verifyJamie(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;
  let t; const v0 = [];
  for (const kv of signatureHeader.split(',')) {
    const i = kv.indexOf('=');
    if (i <= 0) continue;
    const key = kv.slice(0, i).trim(), value = kv.slice(i + 1).trim();
    if (key === 't') t = value; else if (key === 'v0') v0.push(value);
  }
  if (!t || v0.length === 0) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(`${t}.`).update(rawBody).digest('hex');
  return v0.some((sig) => sig.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}
```

Python:

```python
import hashlib
import hmac


def verify_jamie(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not secret or not signature_header:
        return False
    t, v0 = None, []
    for kv in signature_header.split(","):
        key, sep, value = kv.partition("=")
        if not sep:
            continue
        if key.strip() == "t":
            t = value.strip()
        elif key.strip() == "v0":
            v0.append(value.strip())
    if not t or not v0:
        return False
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(sig.encode(), expected.encode()) for sig in v0)
```

Neither verifier checks `t` against the clock; see below.

## Replay Protection

Jamie's docs recommend rejecting timestamps older than 5 minutes (300 s) when Jamie calls you directly. The examples make the window opt-in through `JAMIE_TIMESTAMP_TOLERANCE_SECONDS` (default `0`, off; set `300` to follow Jamie's recommendation; an invalid value leaves the check off, with a warning at startup).

Retries and replays keep the original `t`:

- Jamie's own retries happen up to about an hour after the first attempt, so the last two attempts fall outside a 5-minute window.
- Hookdeck retries and replays resend the original timestamp, so a replay later than 5 minutes always fails.

Behind Hookdeck keep `JAMIE_TIMESTAMP_TOLERANCE_SECONDS=0` and rely on Hookdeck's verification; a window would reject late retries and replays. Either way dedupe on `metadata.id` (the `jamie-delivery` header).

## Common Gotchas

- **Raw body:** sign the exact bytes (`express.raw({ type: '*/*' })`, `request.text()`, `await request.body()`). Jamie's own Node sample verifies `JSON.stringify(req.body)`, which can differ from the bytes sent; don't copy that.
- **Content type:** use `type: '*/*'` in Express so any content type reaches the verifier as a Buffer.
- **Don't decode the secret** or strip a prefix.
- **API key mode sends no signature:** a webhook created in API Key mode has no `x-jamie-signature` header, so every request fails verification. Recreate it with Signature Verification.
- **Secret shown once:** regenerate it from the webhook settings if lost.
- **Header order:** parse `t` and `v0` by name, not by position.

## Debugging Verification Failures

- Confirm `JAMIE_WEBHOOK_SECRET` is the signing secret of the webhook that sent the event.
- Check for whitespace or quotes around the secret in `.env`.
- Check that no body-parsing middleware runs before verification.
- If you set `JAMIE_TIMESTAMP_TOLERANCE_SECONDS`, set it back to `0` to see whether a retry or replay is failing on age.
- No `x-jamie-signature` header means the webhook is in API Key mode, or a proxy stripped the header.
