# Qonto Signature Verification

## How Does Qonto Sign Webhooks?

Each delivery carries `X-Qonto-Signature: t=<unix seconds>,v1=<hex>`.

- Algorithm: HMAC-SHA256, output as lowercase hex (64 characters)
- Key: the subscription secret as UTF-8 bytes, used whole (no `whsec_` stripping, no base64 or hex decoding)
- Message: the `t` value exactly as it appears in the header, a literal `.`, then the raw request body bytes

Qonto uses a `whsec_`-looking secret but this is **not** Standard Webhooks (no `webhook-id` / `webhook-timestamp` / `webhook-signature` headers, and hex rather than base64). Do not use the `standardwebhooks` or `svix` libraries. Qonto provides no SDK for verification, so verify manually.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');
const HEX64 = /^[0-9a-fA-F]{64}$/;

function verifyQontoSignature(rawBody, header, secret) {
  let t = null;
  const candidates = [];
  for (const part of String(header || '').split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim(), value = part.slice(i + 1).trim();
    if (key === 't' && t === null) t = value;
    else if (key === 'v1') candidates.push(value);
  }
  if (!t) return false;

  const expected = Buffer.from(
    crypto.createHmac('sha256', Buffer.from(secret, 'utf8'))
      .update(Buffer.concat([Buffer.from(`${t}.`), rawBody]))
      .digest('hex'));
  return candidates.some((c) => HEX64.test(c) &&
    crypto.timingSafeEqual(Buffer.from(c.toLowerCase()), expected));
}
```

Express: `express.raw({ type: '*/*' })`. Next.js: `Buffer.from(await request.arrayBuffer())`.

### Python

```python
import hashlib, hmac, re

HEX64 = re.compile(r"^[0-9a-fA-F]{64}$")

def verify_qonto_signature(raw_body: bytes, header: str, secret: str) -> bool:
    t, candidates = None, []
    for part in (header or "").split(","):
        key, sep, value = part.partition("=")
        if not sep:
            continue
        key, value = key.strip(), value.strip()
        if key == "t" and t is None:
            t = value
        elif key == "v1":
            candidates.append(value)
    if not t:
        return False
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest().encode()
    return any(HEX64.match(c) and hmac.compare_digest(c.lower().encode(), expected) for c in candidates)
```

FastAPI: `await request.body()`.

## Published Test Vector

Qonto's setup page gives a worked example. Every example's test suite includes it:

| Field | Value |
|-------|-------|
| Secret | `test-secret` |
| Body | `{"test":"data"}` |
| `X-Qonto-Signature` | `t=1704110400,v1=56aff06dc227db80d6568a5070f912c601c31f20451745d257cbc0b5dfa93805` |

If your verifier rejects this, the key, signed message or encoding is wrong.

## Common Gotchas

- **Raw body**: sign the bytes as received. Never `JSON.parse` / `JSON.stringify` (or decode and re-encode) before verifying; whitespace and key order matter.
- **Secret handling**: `whsec_` stays in the key, and nothing is base64-decoded.
- **`t` is a string**: use it as sent. Do not parse it to a number and format it back.
- **Multiple `v1=` entries** (key rotation): accept if any matches. Ignore other keys such as `v0`. Header with no `t=`: fail.
- **Validate before comparing**: require exactly 64 hex characters, lowercase both sides (hex is case-insensitive), then constant-time compare on equal-length buffers. Do not call `Buffer.from(sig, 'hex')` on unvalidated input (it silently drops bad characters). In Python compare `bytes` with `hmac.compare_digest`, not `str`.
- **Timestamp window**: not enforced by default. Qonto documents no tolerance, and Hookdeck retries and replays resend the original headers and timestamp, so a fixed window would reject legitimate retries. The examples offer an opt-in `QONTO_WEBHOOK_TOLERANCE_SECONDS` (`t` is Unix seconds; unset or `0` = off).
- **1-second deadline**: acknowledge first, process later.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Always mismatches | Secret stripped of `whsec_`, base64-decoded, or trimmed; or the body was re-serialized |
| Mismatch only with a proxy/framework | Body parsed or re-encoded before verifying; use the raw bytes |
| Works for the test vector, fails live | Wrong subscription secret (each subscription has its own) |
| `Missing t=` | Header absent or a different format; check you are reading `X-Qonto-Signature` |
| Rejected only on retries/replays | A timestamp tolerance is enabled; remove it or measure from receipt time |

Respond `401` for a missing, malformed or mismatched signature.
