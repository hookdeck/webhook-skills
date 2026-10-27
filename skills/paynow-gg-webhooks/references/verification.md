# PayNow Signature Verification

## How Does PayNow Sign Webhooks?

Each delivery carries:

| Header | Value |
|--------|-------|
| `PayNow-Timestamp` | Unix timestamp in **milliseconds**, as a decimal string |
| `PayNow-Signature` | Standard base64 (padded, 44 characters) HMAC-SHA256 digest. No prefix, no list of signatures |

The signed message is the `PayNow-Timestamp` header value, then a literal `.`, then the raw request body. The key is the webhook's signing secret as UTF-8 bytes.

```
signature = base64( HMAC_SHA256( secret, timestamp + "." + raw_body ) )
```

## Implementation

PayNow has no official verification SDK for these examples, so all three use the manual algorithm. Build the message as **bytes**: separators as UTF-8, the timestamp header as the exact header string (latin-1), and the raw body bytes as received.

### Node.js

```javascript
const crypto = require('crypto');

const SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

function verify(rawBody, timestamp, signature, secret) {
  if (!timestamp || !signature || !SIGNATURE_PATTERN.test(signature)) return false;
  const message = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
  const provided = Buffer.from(signature, 'base64');
  if (provided.toString('base64') !== signature) return false; // non-canonical encoding
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}
```

### Python

```python
import base64, hashlib, hmac, re

def verify(raw_body: bytes, timestamp: str, signature: str, secret: str) -> bool:
    if not timestamp or not re.fullmatch(r"[A-Za-z0-9+/]{43}=", signature or ""):
        return False
    message = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    provided = base64.b64decode(signature, validate=True)
    if base64.b64encode(provided).decode("ascii") != signature:  # non-canonical encoding
        return False
    return hmac.compare_digest(provided, expected)
```

Full handlers with tests: [Express](../examples/express/), [Next.js](../examples/nextjs/), [FastAPI](../examples/fastapi/).

## Should I Reject Old Timestamps?

Not by default. PayNow's [Preventing Replay Attacks](https://docs.paynow.gg/webhooks/preventing-replay-attacks/) page recommends ignoring requests older than 5 minutes, and its sample code does so. But PayNow retries failed deliveries with exponential backoff, and Hookdeck retries and replays resend the **original** headers and timestamp. Hookdeck itself applies no timestamp tolerance, so a fixed window in your handler would reject legitimate retries and replays.

The examples make it opt-in: set `PAYNOW_WEBHOOK_TOLERANCE_SECONDS` (for example `300`). Unset or `0` leaves it off. The check compares `PayNow-Timestamp` (milliseconds) with the current time, in both directions. For replay protection without a window, store `event_id` and ignore duplicates.

## Common Gotchas

- **Raw body.** Verify the exact bytes. In Express use `express.raw({ type: '*/*' })`; in Next.js `await request.arrayBuffer()`; in FastAPI `await request.body()`. PayNow's sample converts the body to a UTF-8 string before hashing; keep it as bytes so non-UTF-8 payloads still verify.
- **Don't decode base64 unvalidated.** `Buffer.from(sig, 'base64')` silently drops invalid characters. Check the 44-character padded alphabet first. In Python use `base64.b64decode(..., validate=True)`. Then re-encode and require the original string, since both decoders ignore stray bits in the last character and Hookdeck compares base64 exactly.
- **Compare as one digest.** Use the whole header value: no splitting, no prefix parsing. Compare in constant time (`crypto.timingSafeEqual` on equal-length buffers, `hmac.compare_digest` on bytes).
- **Milliseconds, not seconds.** `PayNow-Timestamp` is Unix milliseconds. It is signed exactly as sent, so never re-format it.
- **Status codes.** Return `401` for a missing, malformed, or mismatched signature. A response above 299 triggers a retry.
- **Wrong source.** The signing secret belongs to the specific webhook. If you have several, check you are using the right one.

## Debugging Verification Failures

1. Log the received `PayNow-Timestamp`, the signature length (must be 44), and the body length.
2. Confirm the body bytes are unchanged: no JSON middleware in front, no proxy rewriting.
3. Confirm `PAYNOW_WEBHOOK_SECRET` has no stray whitespace or quotes (it is used as UTF-8 text as-is).
4. Recompute with a known-good request from Hookdeck's request view and compare.
