# Rutter Signature Verification

## How It Works

Every Rutter webhook carries two signature headers:

| Header | Value |
|--------|-------|
| `X-Rutter-Signature` | The primary signature: `sha256=` + base64 HMAC-SHA256 of the webhook payload |
| `X-Rutter-Signatures` | Comma-separated list of all currently active signatures |

- Algorithm: HMAC-SHA256, **base64** encoded (not hex), prefixed with `sha256=`
- Signed content: the raw request payload only (no timestamp, no ID)
- Key: your organization's client secret, used as a raw string
- Normally `X-Rutter-Signatures` has one entry equal to `X-Rutter-Signature`. During a secret rotation grace period it has two: the new secret's signature first, the expiring secret's second.

Rutter does not use Standard Webhooks, and sends no timestamp header.

## Implementation

Rutter documents the algorithm but no SDK helper, so verification is manual. Compute `sha256=` + base64(HMAC-SHA256(rawBody, secret)) for each active secret and accept if it matches any entry in `X-Rutter-Signatures`.

### Node.js

```javascript
const crypto = require('crypto');

function verifyRutter(rawBody, signaturesHeader, secrets) {
  if (!signaturesHeader) return false;
  const received = signaturesHeader.split(',').map((s) => s.trim());
  return secrets.some((secret) => {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    return received.some((sig) => {
      try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      } catch {
        return false;
      }
    });
  });
}
```

### Python

```python
import base64, hashlib, hmac

def verify_rutter(raw_body: bytes, signatures_header: str, secrets: list[str]) -> bool:
    received = [s.strip() for s in (signatures_header or "").split(",") if s.strip()]
    for secret in secrets:
        digest = hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
        expected = "sha256=" + base64.b64encode(digest).decode()
        if any(hmac.compare_digest(sig.encode(), expected.encode()) for sig in received):
            return True
    return False
```

The examples read `X-Rutter-Signatures` and fall back to `X-Rutter-Signature` if the list header is missing.

## Common Gotchas

- **Raw body**: sign-check the exact bytes received. Parsing and re-serializing JSON changes the bytes and breaks the match. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Split on commas and trim**: Rutter's docs split on `", "`; trimming whitespace handles both forms.
- **Check every entry**: during rotation the first entry is signed with the new secret and the second with the old one. Matching only the first entry rejects valid deliveries if you still hold only the old secret.
- **`sha256=` prefix**: the prefix is part of the header value. Include it in your computed string, or strip it from both sides.
- **Base64, not hex**.
- **Length mismatch**: `crypto.timingSafeEqual` throws on different lengths; catch it and return false.
- **No replay protection from the signature**: there is no timestamp, so dedupe on `type` + `code` + entity `id` (and `job_id` where present).

## Debugging Verification Failures

1. Confirm you use the client secret of the organization that owns the connection.
2. Log the raw body length and compare it with what Rutter or your tunnel shows; a body-parsing middleware before the route is the usual cause.
3. Print both the computed value and each received entry; check the `sha256=` prefix and base64 padding.
4. If a rotation is in progress, set `RUTTER_CLIENT_SECRET_PREVIOUS` too.
5. Return `400` for a bad signature. Rutter treats any non-2xx as a failed delivery and retries for up to 15 minutes.
