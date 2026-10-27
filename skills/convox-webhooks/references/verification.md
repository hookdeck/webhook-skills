# How to Verify Convox Webhook Signatures

## How Does Convox Sign Webhooks?

Header: `Convox-Signature: t=1714233600,v1=4b2c5f7a8b9d6e3a1f0c5e8d7b4a3c2f1e9d8c7b6a5f4e3d2c1b0a9e8d7c6b5a`

- Algorithm: HMAC-SHA256, output as **lowercase hex** (64 characters)
- Key: the `webhook_signing_key` Rack parameter as its UTF-8 string, **not** hex- or base64-decoded
- Signed message: `<t>.<raw request body>`, where `<t>` is the string from the header, a literal `.`, then the raw body bytes (the Rack builds it with `fmt.Sprintf("%d.%s", t, body)`)
- `t` is the dispatch time in Unix seconds
- Multiple `v1=` entries appear during key rotation (one per active key, up to 4): accept the delivery if **any** of them matches
- Ignore other keys such as `v0`; a header with no `t=` value fails

> Signing is opt-in: set the webhook_signing_key rack parameter (Rack 3.24.6 or later) and paste the same value. Without it, deliveries are unsigned and fail verification.

## Implementation

Convox publishes no verification SDK, so verify manually. Build the signed message from **bytes**: the raw body exactly as received, never decoded to a string and re-encoded, never `JSON.parse`/`JSON.stringify`'d first.

### Node.js

```javascript
const crypto = require('crypto');

function verifyConvox(rawBody, header, secret) {
  let t = null;
  const sigs = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const key = part.slice(0, i).trim(), value = part.slice(i + 1).trim();
    if (key === 't' && t === null) t = value;
    else if (key === 'v1') sigs.push(value);
  }
  if (!t || !/^\d+$/.test(t)) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest();
  return sigs
    .filter((s) => /^[0-9a-fA-F]{64}$/.test(s))       // exact length and alphabet first
    .some((s) => crypto.timingSafeEqual(Buffer.from(s, 'hex'), expected));
}
```

### Python

```python
import hashlib, hmac, re

HEX64 = re.compile(r"[0-9a-fA-F]{64}", re.ASCII)

def verify_convox(raw_body: bytes, header: str, secret: str) -> bool:
    t, sigs = None, []
    for part in header.split(","):
        key, sep, value = part.partition("=")
        key, value = key.strip(), value.strip()
        if not sep or not key:
            continue
        if key == "t" and t is None:
            t = value
        elif key == "v1":
            sigs.append(value)
    if not t or not re.fullmatch(r"[0-9]+", t, re.ASCII):
        return False

    expected = hmac.new(secret.encode("utf-8"), t.encode() + b"." + raw_body, hashlib.sha256).digest()
    return any(hmac.compare_digest(bytes.fromhex(s), expected) for s in sigs if HEX64.fullmatch(s))
```

Hex is compared case-insensitively (as Hookdeck does), so uppercase `v1=` values are accepted. Both sides are decoded to bytes before the constant-time compare. `timingSafeEqual` throws on different lengths, which is why the format check comes first.

## Should I Check the Timestamp?

Convox's own sample code rejects a `t` more than 5 minutes from now. The examples here **don't by default**: Hookdeck retries and replays resend the original headers, so the original `t`, and Hookdeck itself applies no tolerance. A fixed window would reject a legitimate redelivery.

To opt in, set `CONVOX_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds (for example `300`); `t` is Unix seconds. Unset, empty or `0` means off; a value that isn't a whole number is treated as `0`, with a warning at startup.

The signature has no nonce, so within any window a captured request can be replayed. If that matters, dedupe on `data.tick_id` + `action` (Convox recommends this) or cache `(t, body hash)` pairs. Idempotent receivers such as Slack notifications and append-only audit logs usually don't need it.

## Common Gotchas

- **Raw body:** use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` or `await request.body()`. Re-serialised JSON fails.
- **Don't hex-decode the key.** `openssl rand -hex 32` produces a string that Convox uses as 64 UTF-8 bytes. Decoding it gives the wrong key.
- **Keep `t` as a string.** Sign exactly what the header contains; don't parse it to a number and format it again.
- **Any `v1` can match.** Reading only the first `v1=` fails during rotation when the first entry belongs to the old key.
- **Unsigned deliveries:** with no `webhook_signing_key` set, there is no header at all and verification fails. Racks below 3.24.6 never sign. On 3.24.6, non-AWS providers began signing too, so receivers that used to accept unsigned payloads will start seeing the header.
- **Header lookup is case-insensitive:** Node lowercases it (`convox-signature`).
- **No retries:** a `401` or `5xx` from your receiver loses the event for good. Fix verification before relying on the feed, and keep Hookdeck in front if you want retries and replay on your side.

## How Do I Debug Verification Failures?

- Confirm `CONVOX_WEBHOOK_SECRET` matches the Rack's `webhook_signing_key` exactly (no quotes or trailing whitespace in `.env`). Remember a Rack can hold up to 4 keys.
- Check that the header is present at all. A missing header means signing is off on the Rack, the Rack is below 3.24.6, or a proxy stripped it.
- Check that no body-parsing middleware runs before verification.
- If it fails only on some deliveries, check for several `v1=` entries and that you try each one.
- If it fails only on old deliveries, a tolerance window is on; unset `CONVOX_WEBHOOK_TOLERANCE_SECONDS`.
