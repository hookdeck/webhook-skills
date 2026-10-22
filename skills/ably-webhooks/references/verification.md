# Ably Signature Verification

## How It Works

When **Sign with key** is enabled, Ably sends:

| Header | Value |
|--------|-------|
| `X-Ably-Signature` | RFC 3548 base64 of the HMAC-SHA256 of the raw request body |
| `X-Ably-Key` | Identifies the API key (`keyId`) used to sign |

Steps:

1. Take the raw bytes of the body exactly as received.
2. Find the key from `X-Ably-Key`.
3. HMAC-SHA256 the bytes using that key's **`keyValue`**, the secret after the `:` in `appId.keyId:keyValue`.
4. Base64-encode the digest.
5. Compare it to `X-Ably-Signature` with a timing-safe compare.

There is no timestamp, so replay protection needs your own idempotency (see the webhook-handler-patterns skill).

## Implementation

Ably has no SDK helper for this, so verification is manual.

### Node.js

```javascript
const crypto = require('crypto');

function verifyAbly(rawBody, signature, apiKey) {
  const keyValue = apiKey.slice(apiKey.indexOf(':') + 1);
  const expected = crypto.createHmac('sha256', keyValue).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import base64, hashlib, hmac

def verify_ably(raw_body: bytes, signature: str, api_key: str) -> bool:
    key_value = api_key.partition(":")[2]
    digest = hmac.new(key_value.encode(), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(signature, base64.b64encode(digest).decode())
```

## Common Gotchas

- **Use `keyValue`, not the whole API key.** `appId.keyId:keyValue` as the HMAC key never matches.
- **Raw bytes for every content type.** Bodies can be `application/json`, `application/x-msgpack`, `text/plain` or `application/octet-stream`. In Express use `express.raw({ type: '*/*' })`; `express.json()` re-serialises and breaks the signature, and a `type: 'application/json'` filter leaves msgpack unread.
- **msgpack is signed too.** Verify the bytes first, then decode.
- **Signature covers the body only.** In non-enveloped mode the `x-ably-envelope-*` headers are unsigned; use enveloped events if you need to trust that metadata.
- **Several keys.** `X-Ably-Key` tells you which key signed; if a rule's key is rotated, update `ABLY_API_KEY`.
- **Signing is optional.** A missing `X-Ably-Signature` means the rule has signing off; reject it if you require signing.

## Debugging Verification Failures

1. Log `X-Ably-Key` and confirm it matches the key in `ABLY_API_KEY`.
2. Confirm you are using the part after the `:`.
3. Compare the length and a hash of the raw body bytes before and after any middleware.
4. Confirm no proxy re-encodes the body; Hookdeck forwards the original bytes.
5. Use **Test rule** in the dashboard and inspect the request on webhook.site.
