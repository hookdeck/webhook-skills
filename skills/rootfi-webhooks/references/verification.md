# How to Verify RootFi (Commenda) Webhook Signatures

## How It Works

When a webhook config has a `signing_key`, RootFi signs each delivery and sends the result in `X-RootFi-Signature`:

```
X-RootFi-Signature: t=1716035258,v1=5257a869e7d0a1b...
```

- `t` is the Unix timestamp in seconds.
- `v1` is a lowercase hex HMAC-SHA256.
- The signed message is `t`, a literal `.`, then the **raw** request body: `HMAC-SHA256(signing_key, "{t}.{raw_body}")`.
- The key is the `signing_key` string as UTF-8 bytes, used as-is.

If the config has no signing key, the header is not sent at all (the deliveries are unsigned), so verification fails. See [setup.md](setup.md).

The delivery also carries `X-RootFi-Timestamp` (when the attempt was made) and `X-RootFi-Webhook-Delivery-Id`. They are not part of the signature: sign with the `t` from `X-RootFi-Signature`.

## Implementation

RootFi publishes no SDK for verification, so every example verifies manually.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyRootfi(rawBody /* Buffer */, header, secret) {
  if (!secret || !header) return false;
  let t; const v1 = [];
  for (const part of header.split(',')) {
    const p = part.trim(), i = p.indexOf('=');
    if (i > 0) { const k = p.slice(0, i).trim(), v = p.slice(i + 1).trim();
      if (k === 't') t = v; else if (k === 'v1') v1.push(v); }
  }
  if (!t || v1.length === 0) return false;

  const expected = crypto.createHmac('sha256', secret)
    .update(`${t}.`).update(rawBody).digest();
  return v1.some((s) => /^[0-9a-f]{64}$/i.test(s) &&
    crypto.timingSafeEqual(Buffer.from(s, 'hex'), expected));
}
```

Express: `express.raw({ type: '*/*' })`, then `req.body` is a `Buffer`. Next.js: `Buffer.from(await request.arrayBuffer())`.

### Python (FastAPI)

```python
import hashlib, hmac, re

def verify_rootfi(raw_body: bytes, header: str, secret: str) -> bool:
    t, v1 = None, []
    for part in (header or "").split(","):
        k, sep, v = part.strip().partition("=")
        if sep and k.strip() == "t": t = v.strip()
        elif sep and k.strip() == "v1": v1.append(v.strip())
    if not secret or not t or not v1:
        return False
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest().encode()
    return any(re.fullmatch(r"[0-9a-fA-F]{64}", s, re.ASCII) and
               hmac.compare_digest(s.lower().encode(), expected) for s in v1)
```

FastAPI: `await request.body()` returns the raw bytes.

## Optional Timestamp Window

RootFi's docs show a 300-second tolerance in their sample and call it a reasonable default to limit replay attacks. The examples leave it **off** unless you opt in, because Hookdeck retries and replays resend the original headers and timestamp (and Hookdeck applies no tolerance itself), so a fixed window would reject legitimate retries.

To opt in, set `ROOTFI_WEBHOOK_TOLERANCE_SECONDS` to a positive whole number of seconds. The check goes right after the header is parsed and before the HMAC:

```javascript
const tolerance = Number(process.env.ROOTFI_WEBHOOK_TOLERANCE_SECONDS || 0);
if (tolerance > 0 && Math.abs(Date.now() / 1000 - Number(t)) > tolerance) return false;
```

Only parse `t` as a number for this check. The HMAC always uses the original string. Without a window, rely on `X-RootFi-Webhook-Delivery-Id` for idempotency.

## Common Gotchas

- **Raw body.** Verify the exact bytes received. Parsing and re-serializing JSON changes key order and whitespace, and the signature will not match. Never decode the body to a string and encode it again.
- **`t` is a string.** Use it exactly as it appears in the header. Do not parse it to a number and format it again.
- **Key is plain UTF-8.** Do not hex- or base64-decode the `signing_key`, and do not strip a prefix.
- **Validate before decoding.** Check that `v1` is exactly 64 hex characters before `Buffer.from(sig, 'hex')`, which silently drops invalid characters. Hex is case-insensitive, so lowercase (or decode) both sides.
- **Constant-time compare.** `crypto.timingSafeEqual` on equal-length Buffers; `hmac.compare_digest` on bytes, never `str`.
- **More than one `v1`.** Accept the delivery if any `v1` matches and ignore other keys such as `v0`. A header with no `t` or no `v1` fails.
- **No header means unsigned.** Missing or empty `X-RootFi-Signature` returns 401. Check that the config has a `signing_key`.
- **Return codes.** 401 for a missing or invalid signature; any `2xx` for success. Anything else is retried, up to 5 attempts.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Header missing entirely | The webhook config has no `signing_key` (set one) |
| Always 401 | Wrong `ROOTFI_WEBHOOK_SECRET` (must equal the config's `signing_key`), or the body was parsed before verification |
| 401 only for some payloads | Body decoded to a string and re-encoded, or a proxy changed the bytes (compression, re-encoding) |
| 401 on old retries only | Timestamp window enabled: unset `ROOTFI_WEBHOOK_TOLERANCE_SECONDS` |
| 401 after rotating the key | The config and your secret differ; update both |
