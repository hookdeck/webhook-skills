# How to Verify Autotask Webhook Signatures

## How It Works

Autotask computes an HMAC-SHA1 over the **raw request body** using the webhook's `SecretKey`, base64-encodes it, and sends it as:

```
X-Hook-Signature: sha1=UaDXFl2DRDu9dnINVkFle7y5uAE=
```

You compute the same value and compare. Nothing but the body is signed; there is no timestamp or ID header.

## Implementation

Autotask provides no SDK, so use the language's crypto library.

### Node.js

```javascript
const crypto = require('crypto');

function verifyAutotaskWebhook(rawBody, header, secret) {
  if (typeof header !== 'string' || !header.startsWith('sha1=')) return false;
  const received = header.slice('sha1='.length);
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('base64');
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import base64, hashlib, hmac

def verify_autotask_webhook(raw_body: bytes, header: str, secret: str) -> bool:
    if not header or not header.startswith("sha1="):
        return False
    received = header[len("sha1="):]
    expected = base64.b64encode(
        hmac.new(secret.encode(), raw_body, hashlib.sha1).digest()
    ).decode("ascii")
    return hmac.compare_digest(expected.encode("utf-8"), received.encode("utf-8"))
```

## Common Gotchas

- **Use the raw body.** Re-serialising parsed JSON changes whitespace and key order. In Express use `express.raw({ type: '*/*' })` so any content type is read as bytes.
- **Keep the `=` padding** and require and strip the `sha1=` prefix.
- **Compare in constant time, as strings, not decoded bytes.** Compare the base64 text as equal-length buffers; don't base64-decode the header (lenient decoders accept trailing junk). Check lengths first because `crypto.timingSafeEqual` throws on a mismatch.
- **Compare bytes in Python.** `hmac.compare_digest` raises `TypeError` for non-ASCII `str` arguments, which would turn a bad header into a 500. Encode both sides.
- **The header is `X-Hook-Signature`** (HTTP headers are case-insensitive; Node and Next.js lowercase it).
- **The secret is yours.** It is the `SecretKey` you set at creation, up to 64 characters.
- **No replay protection is built in.** Use `Guid` (unique per callout) for idempotency.

## Debugging Verification Failures

- Print the raw body length and compare with a signature made by an online HMAC generator (key = SecretKey, output = Base64, SHA1).
- A body-parsing middleware ahead of the route is the most common cause.
- A signature that never matches usually means the `SecretKey` differs from the webhook's; update it through the API and the env var together.
- Return 401 for a missing or invalid signature and 200 only after you have verified and queued the event.
