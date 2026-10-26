# How to Verify Tremendous Webhook Signatures

## How Does Tremendous Sign Webhooks?

Every request carries a `Tremendous-Webhook-Signature` header. Its value is always `sha256=` followed by the hex HMAC-SHA256 of the **whole raw request body**, keyed with the webhook's `private_key` (returned when you create or retrieve the webhook through the API). There is no timestamp or message ID in the signed content.

```
Tremendous-Webhook-Signature: sha256=3f1c...e9a2   (64 hex chars after the prefix)
```

## Implementation

Tremendous has no SDK helper for this, so verification is manual (the official docs show Ruby).

### Node.js

```javascript
const crypto = require('crypto');

function verifyTremendousWebhook(rawBody, signatureHeader, privateKey) {
  if (!signatureHeader || !privateKey || !signatureHeader.startsWith('sha256=')) return false;
  const sig = signatureHeader.slice('sha256='.length);
  if (!/^[0-9a-f]{64}$/i.test(sig)) return false;   // guard before the hex decode
  const expected = crypto.createHmac('sha256', privateKey).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected);
}
```

### Python

```python
import hashlib, hmac

def verify_tremendous_webhook(raw_body: bytes, signature_header: str | None, private_key: str | None) -> bool:
    if not signature_header or not private_key or not signature_header.startswith("sha256="):
        return False
    sig = signature_header[len("sha256="):].lower()
    expected = hmac.new(private_key.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig.encode(), expected.encode())
```

## Common Gotchas

- **Use the raw body.** `JSON.stringify(JSON.parse(body))` can change whitespace or key order and break the signature. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Strip the `sha256=` prefix.** It is always present. Reject headers that lack it.
- **Validate hex before decoding.** `Buffer.from(x, 'hex')` silently truncates at the first invalid character, so check `/^[0-9a-f]{64}$/i` first (or compare the lowercase hex strings as equal-length UTF-8 buffers after a length check).
- **Compare bytes in Python.** `hmac.compare_digest` raises `TypeError` for non-ASCII `str` arguments, which would turn a junk header into a 500. Encode both sides.
- **Use the webhook's `private_key`**, not your API key. Sandbox and production have different keys.
- **No timestamp.** There is nothing to check for replay; dedupe on the payload's `uuid` instead.

## How to Debug Verification Failures

1. Log the exact header and confirm it starts with `sha256=` and has 64 hex characters after it.
2. Confirm you read the body as raw bytes before any JSON middleware ran.
3. Retrieve the webhook through the API and compare its `private_key` with your env var.
4. Make sure you aren't verifying a sandbox delivery with the production key (or vice versa).
5. Check that a proxy isn't re-encoding or re-compressing the body.
