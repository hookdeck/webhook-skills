# Bitculator Signature Verification

## How It Works

Every delivery is signed in one header (the only delivery header Bitculator's docs name):

```
X-Bitculator-Signature: t=1700000000,v1=<64 lowercase hex characters>
```

- `t` is the Unix timestamp in seconds.
- `v1` is the HMAC-SHA256, in hex, of the string `<t>.<raw request body>`.
- The key is the signing secret string returned once by `POST /api/v1/webhooks` (for example `whsec_k5cQ1x9jJ2mW7pR4tY8uB3nV6zA0sD5f`), taken as its UTF-8 bytes **including the `whsec_` prefix**. Do not strip the prefix and do not base64-decode it.

Bitculator's own example (PHP):

```php
[$t, $v1] = sscanf($_SERVER['HTTP_X_BITCULATOR_SIGNATURE'], 't=%d,v1=%s');
$expected = hash_hmac('sha256', $t.'.'.file_get_contents('php://input'), $secret);
abort_unless(hash_equals($expected, $v1) && abs(time() - $t) < 300, 403);
```

## Implementation

Rules the examples follow:

1. Split the header on `,` into `key=value` pairs. Collect `t` and every `v1`; ignore other keys.
2. Fail if `t` is missing or is not all ASCII digits.
3. Build the signed message as **bytes**: the `t` string exactly as it appears in the header, a literal `.`, then the raw body bytes as received. Never parse `t` to a number and re-format it (`01700000000` would change), and never decode and re-encode the body or `JSON.parse`/`JSON.stringify` it first.
4. Accept if **any** `v1` matches (Hookdeck does).
5. Validate `v1`'s format before comparing: exactly 64 hex characters. Hex is compared case-insensitively, so lowercase both sides.
6. Compare in constant time: Node checks lengths and uses `crypto.timingSafeEqual` on equal-length Buffers; Python uses `hmac.compare_digest` on `bytes`.
7. Missing or empty header, malformed value, or mismatch: respond **401**.

### Node.js (Express)

```javascript
const crypto = require('crypto');

function verifyBitculator(rawBody, signatureHeader, secret, toleranceSeconds = 0) {
  if (!secret || !signatureHeader) return false;
  let t; const v1 = [];
  for (const kv of signatureHeader.split(',')) {
    const i = kv.indexOf('=');
    if (i <= 0) continue;
    const key = kv.slice(0, i).trim(), value = kv.slice(i + 1).trim();
    if (key === 't') t = value; else if (key === 'v1') v1.push(value);
  }
  if (!t || !/^[0-9]+$/.test(t)) return false;
  if (toleranceSeconds > 0 && !(Math.abs(Math.floor(Date.now() / 1000) - Number(t)) < toleranceSeconds)) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex'));
  return v1.some((sig) => /^[0-9a-fA-F]{64}$/.test(sig) &&
    crypto.timingSafeEqual(Buffer.from(sig.toLowerCase()), expected));
}

// app.post('/webhooks/bitculator', express.raw({ type: '*/*' }), (req, res) => { ... verifyBitculator(req.body, ...) })
```

Never call `Buffer.from(sig, 'hex')` on an unvalidated value: it silently drops bad characters.

### Python (FastAPI)

```python
import hashlib, hmac, re, time

def verify_bitculator(raw_body: bytes, header: str, secret: str, tolerance: int = 0) -> bool:
    if not secret or not header:
        return False
    t, v1 = None, []
    for kv in header.split(","):
        key, sep, value = kv.partition("=")
        if sep and key.strip() == "t": t = value.strip()
        elif sep and key.strip() == "v1": v1.append(value.strip())
    if not t or not re.fullmatch(r"[0-9]+", t):
        return False
    if tolerance > 0 and not abs(int(time.time()) - int(t)) < tolerance:
        return False
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest().encode()
    return any(re.fullmatch(r"[0-9a-fA-F]{64}", sig) and hmac.compare_digest(sig.lower().encode(), expected)
               for sig in v1)

# raw_body = await request.body()
```

Compare `bytes`, never `str`: `compare_digest` raises `TypeError` on a non-ASCII `str`, and header values can contain non-ASCII characters.

## Timestamp Tolerance (Opt-In)

The vendor's PHP example rejects timestamps 300 seconds or more from now. The examples do **not** reject old timestamps by default. Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck's Bitculator source verifies the signature without applying a tolerance, so a fixed window would reject legitimate retries.

Set `BITCULATOR_WEBHOOK_TOLERANCE_SECONDS` to opt in. Unset or `0` means off; `300` matches the vendor's example when receiving directly. `t` is Unix seconds and the check uses the absolute difference, as the vendor does (a timestamp too far in the future is rejected too). Handle duplicate deliveries with idempotency instead; see the [webhook-handler-patterns idempotency guide](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md).

## Common Gotchas

- **Raw body.** Read the exact bytes before any JSON parsing. In Express use `express.raw({ type: '*/*' })`, not `express.json()`; in Next.js use `await request.arrayBuffer()`; in FastAPI use `await request.body()`.
- **Whole secret.** The key is the full `whsec_...` string. Stripping the prefix or base64-decoding it gives a different key and every delivery fails with 401.
- **`t` as a string.** Sign `t` exactly as it appears in the header.
- **Multiple `v1` entries.** Accept the delivery if any one matches.
- **Hex case.** Compare case-insensitively after checking for exactly 64 hex characters.

## Debugging Verification Failures

1. Send `POST /api/v1/webhooks/{id}/test` and capture the headers and raw body (for example in the Hookdeck CLI web UI).
2. Recompute the HMAC by hand over `<t>.<raw body>` with the secret from registration, and compare with `v1`:

   ```bash
   printf '%s.%s' "$T" "$RAW_BODY" | openssl dgst -sha256 -hmac "$BITCULATOR_WEBHOOK_SECRET"
   ```
3. If it differs, check in this order: a body parser ran before verification; the secret was stripped or decoded; the secret is not the one returned when this endpoint was registered (it is shown only once); a proxy changed the body bytes.
4. Check `GET /api/v1/webhooks/{id}/deliveries` for `response_status` and `error` values from Bitculator's side.
