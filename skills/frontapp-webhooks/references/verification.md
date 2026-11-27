# How to Verify Front Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is public. Signature verification proves a request genuinely came
from Front and was not tampered with in transit. Reject any request whose signature does
not match before acting on the payload.

## How It Works (Application Webhooks)

Front computes the signature as:

```
X-Front-Signature = base64( HMAC-SHA256( key = app signing key,
                                         msg = X-Front-Request-Timestamp + ":" + rawBody ) )
```

- **Algorithm:** HMAC-SHA256
- **Encoding:** base64
- **Key:** your app's signing key (`FRONT_WEBHOOK_SECRET`)
- **Signed content:** the `X-Front-Request-Timestamp` header value, a literal `:`, then the
  **raw** request body bytes (do not re-serialize parsed JSON)

Relevant headers:

| Header | Purpose |
|--------|---------|
| `X-Front-Signature` | base64 HMAC-SHA256 signature to compare against |
| `X-Front-Request-Timestamp` | timestamp value that is prepended to the body before signing |
| `X-Front-Challenge` | present only on the subscription validation request — echo it back |

> Front has **no official server SDK** (`front-sdk` on npm and `py-front` on PyPI are
> community projects). Verify manually with your platform's crypto library.

## Implementation

### Manual Verification (Node.js)

```javascript
const crypto = require('crypto');

function verifyFrontSignature(rawBody, timestamp, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(timestamp + ':');
  hmac.update(rawBody);                       // Buffer or string of the raw body
  const expected = hmac.digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;                             // different lengths = invalid
  }
}
```

### Manual Verification (Python)

```python
import base64
import hashlib
import hmac

def verify_front_signature(raw_body: bytes, timestamp: str, signature: str, secret: str) -> bool:
    mac = hmac.new(secret.encode("utf-8"), digestmod=hashlib.sha256)
    mac.update((timestamp + ":").encode("utf-8"))
    mac.update(raw_body)                       # raw body bytes
    expected = base64.b64encode(mac.digest()).decode("utf-8")
    return hmac.compare_digest(expected, signature or "")
```

## The Challenge Handshake

Before verifying signatures on real events, handle the subscription validation request. If
the incoming request has an `X-Front-Challenge` header, reply within 10 seconds with HTTP
`200` echoing the value:

```json
{ "challenge": "<value from X-Front-Challenge>" }
```

(You may also reply `text/plain` with just the value, or form-encoded `challenge=<value>`.)

## Rule Webhooks Differ

**Rule webhooks** use **HMAC-SHA1** (base64) over the **body only**, keyed with
the "API Secret" from the Webhooks app — no timestamp, 5s timeout, no retries. Do not use
the SHA256 timestamp scheme above for rule webhooks.

## Common Gotchas

- **Use the raw body.** Compute the HMAC over the exact bytes Front sent. Parsing to JSON
  and re-stringifying changes whitespace/key order and breaks the signature.
- **Prepend the timestamp.** The signed message is `timestamp + ":" + body`, not the body
  alone. Read the timestamp from `X-Front-Request-Timestamp`.
- **base64, not hex.** The digest is base64-encoded.
- **Header case.** HTTP headers are case-insensitive; frameworks lowercase them
  (`x-front-signature`, `x-front-request-timestamp`, `x-front-challenge`).
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest` and guard
  against length mismatches.
- **Answer the challenge first.** Handle `X-Front-Challenge` before signature checks so
  subscription validation succeeds.
- **Acknowledge fast.** Return `2xx` within 5 seconds or Front retries (up to 3×) and then
  auto-disables the webhook.

## Debugging Verification Failures

- **Signature never matches:** confirm you are signing `timestamp + ":" + rawBody` (raw
  bytes) and base64-encoding, and that you use the app **signing key**, not an API token.
- **Works locally, fails behind a proxy:** a proxy/body-parser may have re-serialized the
  body. Capture the raw body before any JSON parsing.
- **Subscription won't validate:** ensure you echo `X-Front-Challenge` with a `200` within
  10 seconds.
