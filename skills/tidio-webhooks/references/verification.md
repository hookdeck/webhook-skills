# Tidio Webhook Signature Verification

## How Does Tidio Sign Webhooks?

Every delivery carries an `x-tidio-signature` header:

```
x-tidio-signature: t=1680652800,s=c64b17322c4519dd324a6014658c518df231ec3e2c6ac8ac19fced7ee4d54014,s=44565a4390252ed0692e1bb55b4ca2c7f581bbf919fec54f797fa8a1647969cd
```

- `t` is the signing timestamp (Unix seconds).
- Each `s` is a signature for one webhook secret (several while you rotate secrets).
- Signed content is the **raw request body**, then a literal underscore, then the `t` value: `{request_body}_{signing_timestamp}`.
- The signature is **lowercase hex HMAC-SHA256** keyed with the webhook secret (its UTF-8 bytes, not hex- or base64-decoded).
- The request is authentic if the computed hash equals **any** `s` value.

Tidio provides no SDK for this; its docs show a hand-written verifier (PHP, Node.js, Python).

## Implementation

Build the signed message as **bytes** and never decode and re-encode the body. The `t` value is the exact string from the
header (encode it latin-1, never trim or reformat it).

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function verifyTidio(rawBody, header, secret) {
  let t;
  const sigs = [];
  for (const item of (header || '').split(',')) {
    const i = item.indexOf('=');
    if (i === -1) continue;
    const key = item.slice(0, i), value = item.slice(i + 1);
    if (key === 't' && t === undefined) t = value;
    else if (key === 's') sigs.push(value);
  }
  if (!t || sigs.length === 0) return false;

  const signed = Buffer.concat([rawBody, Buffer.from('_', 'utf8'), Buffer.from(t, 'latin1')]);
  const expected = Buffer.from(crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signed).digest('hex'));

  let valid = false;
  for (const s of sigs) {
    if (!/^[0-9a-fA-F]{64}$/.test(s)) continue;          // exact length and alphabet first
    const candidate = Buffer.from(s.toLowerCase());
    if (candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)) valid = true;
  }
  return valid;
}
```

### Python (FastAPI)

```python
import hashlib, hmac, re

def verify_tidio(raw_body: bytes, header: str, secret: str) -> bool:
    t, sigs = None, []
    for item in (header or "").split(","):
        key, sep, value = item.partition("=")
        if not sep:
            continue
        if key == "t" and t is None:
            t = value
        elif key == "s":
            sigs.append(value)
    if not t or not sigs:
        return False

    signed = b"".join([raw_body, b"_", t.encode("latin-1")])
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest().encode("ascii")

    valid = False
    for s in sigs:
        if re.fullmatch(r"[0-9a-fA-F]{64}", s) and hmac.compare_digest(s.lower().encode("ascii"), expected):
            valid = True
    return valid
```

The runnable, tested versions are in [examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and
[examples/fastapi/](../examples/fastapi/).

## What About Timestamp Tolerance?

Tidio's documentation does not require checking `t` against the clock, and **the examples do not reject old timestamps by
default**. Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck itself applies no tolerance,
so a fixed window would reject legitimate deliveries. If you receive directly from Tidio and want replay protection, set
`TIDIO_WEBHOOK_TOLERANCE_SECONDS` (for example `300`). `t` is Unix seconds; unset or `0` turns the check off. Tidio's own
retries can arrive up to about 4 h 45 min later, so a short window will drop late retries. Deduplicating on `webhook_id`
is the more robust replay defence.

## Common Gotchas

- **Raw body**: any parse and re-serialize changes the bytes. Use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()`, or `await request.body()`.
- **Order**: body first, then `_`, then `t`. `t.body` or `t_body` will never match.
- **Multiple `s` values**: during secret rotation the header holds one `s` per secret; accept if any matches.
- **Hex case**: compare case-insensitively (lowercase both sides) after checking for exactly 64 hex characters.
- **Never call `Buffer.from(sig, 'hex')` on an unvalidated value**: it silently drops invalid characters. Validate the alphabet and length first.
- **Constant-time compare**: `crypto.timingSafeEqual` on equal-length Buffers; `hmac.compare_digest` on bytes (not `str`).
- **Secret as text**: the key is the secret string's UTF-8 bytes as-is.
- **Status codes**: missing or empty header, missing `t` or `s`, malformed signature, or mismatch all return `401`.
- **OpenAPI changes** never produce webhooks, so a quiet endpoint after an API-driven change is expected.

## Debugging Verification Failures

1. Log the exact `x-tidio-signature` header and the raw body length; confirm the body was not parsed or re-encoded by middleware.
2. Confirm `TIDIO_WEBHOOK_SECRET` is the secret from **Settings > Developer > Webhooks** with no surrounding whitespace.
3. Recompute with the docs' verifier (`{body}_{t}`) against one failing delivery to separate a code bug from a wrong secret.
4. Behind a proxy or Hookdeck, check that the body is forwarded unchanged (no compression or re-serialization).
5. If a tolerance is set and only retries fail, unset `TIDIO_WEBHOOK_TOLERANCE_SECONDS`.
