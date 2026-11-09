# Pylon Signature Verification

## How It Works

Pylon signs every delivery from a trigger or macro, and every test sent from a saved
webhook, with HMAC-SHA256:

```
signed_content = X-Pylon-Timestamp + "." + raw_body
signature      = hex( HMAC_SHA256(webhook_secret, signed_content) )
```

The result is sent in `X-Pylon-Signature-V2`, with no prefix. `X-Pylon-Timestamp` is
the send time in Unix seconds.

To verify a delivery (from Pylon's docs):

1. Read `X-Pylon-Timestamp` and reject the request if it is more than 5 minutes from
   your server's current time.
2. Build the signed string: the timestamp, a period (`.`), and the raw request body
   exactly as received, before any JSON parsing.
3. Compute the HMAC-SHA256 of that string with your webhook secret as the key, and
   hex-encode it. Use the secret string as-is; don't hex-decode it.
4. Compare your result to `X-Pylon-Signature-V2` with a constant-time comparison.

Retries are signed again with a fresh timestamp, so a retried delivery passes the
timestamp check.

There is no official Pylon SDK, so verify manually in every language.

## Implementation

### Node.js (`node:crypto`)

```javascript
const crypto = require('crypto');

const TOLERANCE_SECONDS = 5 * 60;

function verifyPylonWebhook(rawBody, timestamp, signature, secret) {
  if (!timestamp || !signature || !secret) return false;
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > TOLERANCE_SECONDS) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python (`hmac`)

```python
import hashlib
import hmac
import time

TOLERANCE_SECONDS = 5 * 60

def verify_pylon_webhook(raw_body: bytes, timestamp: str, signature: str, secret: str) -> bool:
    if not timestamp or not signature or not secret:
        return False
    try:
        if abs(time.time() - int(timestamp)) > TOLERANCE_SECONDS:
            return False
    except ValueError:
        return False
    signed = timestamp.encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    # Compare bytes: compare_digest raises on non-ASCII str input
    return hmac.compare_digest(expected.encode(), signature.encode())
```

## Legacy `X-Pylon-Signature`

`X-Pylon-Signature` is a hex HMAC-SHA256 of the body only. Because it covers no
timestamp, a captured request verifies indefinitely. Pylon still sends it for
existing integrations, but new integrations should verify `X-Pylon-Signature-V2`
together with the timestamp.

## Common Gotchas

- **Use the raw body.** If you parse and re-serialize the JSON, whitespace and key
  order change and the signature won't match. In Express use `express.raw()`, in
  Next.js `await request.text()`, and in FastAPI `await request.body()`.
- **Include the timestamp.** The signed content is `timestamp + "." + body`, not the
  body alone.
- **Don't hex-decode the secret.** Use it as a UTF-8 string key.
- **Constant-time compare.** Use `crypto.timingSafeEqual` (check lengths first; it
  throws on a mismatch) or `hmac.compare_digest`.
- **Create-dialog tests are unsigned.** Send tests from Edit on the saved webhook.
- **Keep a body-carrying method.** Pylon lets you choose GET or DELETE, but a
  bodyless request can't carry the signed body your handler needs.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Signature never matches | The body was parsed or re-serialized before verifying |
| Signature never matches | The signed content left out the `timestamp.` prefix |
| Signature never matches | Compared against the legacy `X-Pylon-Signature` |
| Signature never matches | The secret was hex-decoded instead of used as a string |
| Test requests fail, real ones pass | The test was sent from the create dialog (unsigned) |
| Rejected as stale | Server clock drift beyond 5 minutes |
| Works locally, fails in prod | Wrong `PYLON_WEBHOOK_SECRET` (each webhook has its own) |
