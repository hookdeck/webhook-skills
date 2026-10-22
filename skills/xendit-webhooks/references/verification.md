# How to Verify Xendit Webhooks

## How It Works

Xendit does not compute a signature. Each webhook carries your **webhook verification token** in the `x-callback-token` header, as-is. Verification is a constant-time comparison of that header with the token stored in `XENDIT_CALLBACK_TOKEN`. There is no timestamp, no HMAC, and no signed payload.

| Header | Value |
|--------|-------|
| `x-callback-token` | The token from Dashboard > Settings > Webhooks |

## Implementation

No SDK is needed.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

// Hash both sides so the buffers are equal length: timingSafeEqual can't throw
// and the token's length isn't revealed.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyXenditToken(headers, token = process.env.XENDIT_CALLBACK_TOKEN) {
  if (!token) return false;
  const received = headers['x-callback-token'];
  return Boolean(received) && !Array.isArray(received) && safeEqual(received, token);
}
```

### Python (FastAPI)

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest()
    )

def verify_xendit_token(headers) -> bool:
    token = os.environ.get("XENDIT_CALLBACK_TOKEN")
    received = headers.get("x-callback-token")
    return bool(token and received and safe_equal(received, token))
```

In FastAPI, wrap this in a dependency (`Depends(require_xendit_token)`) so the route never runs for unverified requests.

## Common Gotchas

- **Don't use `===` / `==`.** Plain comparison returns at the first differing character. Use `crypto.timingSafeEqual` / `hmac.compare_digest`.
- **`timingSafeEqual` throws on unequal lengths.** Hash both values first, as above.
- **`hmac.compare_digest` raises `TypeError` on non-ASCII `str`.** Compare the digests (bytes).
- **Empty token.** If `XENDIT_CALLBACK_TOKEN` is unset, reject everything. Never compare against an empty string.
- **Read the body raw, any content type.** Nothing is signed, but use `express.raw({ type: '*/*' })` (or `request.text()` / `request.body()`) so a webhook isn't refused over its `Content-Type`; check the token, then parse.
- **Not every Xendit product uses this token.** Bill Payments callbacks use `X-Callback-Signature` (HMAC SHA256) and `X-Callback-Timestamp`. Check the product's webhook page.
- **No replay protection.** The token is static, so a captured request can be replayed. Use HTTPS only, and dedupe on `payment_id` / `capture_id` (Xendit itself retries and can send duplicates).
- **Rotating the token.** Update `XENDIT_CALLBACK_TOKEN` at the same time as the dashboard, or webhooks return `401` and Xendit retries.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `401` on every webhook | `XENDIT_CALLBACK_TOKEN` differs from the dashboard token (check trailing whitespace/newlines, and test vs live mode) |
| `401`, header looks right | Env var not loaded (`.env` missing), so the handler rejects everything |
| `400 Invalid JSON body` | A product sent a non-JSON body, or a proxy altered it |
| Retries keep arriving | Your endpoint returned non-2xx or timed out; return `200` quickly |
| Works in tests, fails in production | A proxy strips or renames custom headers; check `x-callback-token` reaches the app |
