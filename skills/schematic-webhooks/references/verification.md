# How to Verify Schematic Webhook Signatures

## How It Works

Every request carries:

| Header | Description |
|--------|-------------|
| `X-Schematic-Webhook-Signature` | Bare lowercase hex HMAC-SHA256 digest, no prefix |
| `X-Schematic-Webhook-Timestamp` | Unix timestamp (seconds) of this attempt |
| `X-Schematic-Webhook-Signature-Version` | `v1`; not part of the signed content |

```
signature = hex( HMAC-SHA256( secret, rawBody + "+" + timestamp ) )
```

Body first, then a literal `+`, then the timestamp header value. Schematic signs every attempt with a fresh timestamp; Hookdeck retries and replays resend the original headers.

## Implementation

Build everything as bytes:

- literal separator `+` as UTF-8
- timestamp header string encoded latin1 (`Buffer.from(ts, 'latin1')` / `ts.encode('latin-1')`), never trimmed, parsed or reformatted
- raw body bytes exactly as received; never decode and re-encode, never `JSON.parse`/`JSON.stringify` before verifying
- key = the secret's UTF-8 bytes, used as-is

### Node.js

```javascript
const crypto = require('crypto');

const HEX64 = /^[0-9a-fA-F]{64}$/;

function verify(rawBody, signature, timestamp, secret) {
  if (!signature || !timestamp || !HEX64.test(signature)) return false;
  const signed = Buffer.concat([rawBody, Buffer.from('+'), Buffer.from(timestamp, 'latin1')]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signed).digest();
  const provided = Buffer.from(signature, 'hex'); // safe: validated above
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}
```

### Python

```python
import hashlib, hmac, re

def verify(raw_body: bytes, signature: str, timestamp: str, secret: str) -> bool:
    if not signature or not timestamp or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    signed = b"".join([raw_body, b"+", timestamp.encode("latin-1")])
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature), expected)
```

### SDK helpers

Schematic's SDKs include verify helpers, e.g. `verifyWebhookSignature(req, secret, rawBody)` in `@schematichq/schematic-typescript-node`. The examples here verify by hand so one implementation works across Express, Next.js and FastAPI and matches Hookdeck's own verification.

## Optional Timestamp Tolerance

Schematic's docs describe no required replay window, and the examples apply none by default. Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck itself applies no tolerance, so a fixed window would reject legitimate retries.

If you receive directly from Schematic and want a window, set `SCHEMATIC_WEBHOOK_TOLERANCE_SECONDS` (for example `300`). Unset or `0` turns it off. The check runs after the signature matches and compares against `X-Schematic-Webhook-Timestamp` (Unix seconds). Idempotency on `event_id` is the more robust replay defence.

## Common Gotchas

- **Raw body**: use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` (Next.js) or `await request.body()` (FastAPI). Parsed or re-serialized bodies never match.
- **Order**: body, then `+`, then timestamp. Timestamp-first is wrong.
- **Whole header is the digest**: no `sha256=` prefix, no comma or space lists.
- **Secret is not decoded**: do not base64- or hex-decode it.
- **Hex case**: compare case-insensitively; require exactly 64 hex characters first.
- **`Buffer.from(sig, 'hex')` on unvalidated input** silently drops bad characters; validate the alphabet and length first.
- **`hmac.compare_digest` on `str`** raises on non-ASCII; compare bytes.
- **Fresh signature each attempt**: the timestamp and signature change on every retry, while `event_id` and the body stay the same.
- **Status codes**: respond `401` for a bad or missing signature; any non-2xx (including `3xx`) makes Schematic retry.

## Debugging Verification Failures

1. Log the raw body length and compare it with what a proxy or framework middleware might have altered.
2. Confirm no `express.json()` (or similar) runs before the route.
3. Check the secret has no trailing whitespace or newline from the env file.
4. Recompute with the exact timestamp header string, untrimmed.
5. Dashboard test sends carry no `event_id`; make sure your handler does not require one.
