# Oh Dear Signature Verification

## How Does Oh Dear Sign Webhooks?

For every webhook, Oh Dear adds an `OhDear-Signature` header. Per the docs it is computed as:

```php
$computedSignature = hash_hmac('sha256', $payload, $secret);
```

- `$payload` is the body of the `POST` request (a JSON representation of the event).
- `$secret` is the team's signing secret from the notification settings page.
- PHP's `hash_hmac` returns lowercase hex by default, so the header is the bare 64-character lowercase hex digest. There is no `sha256=` prefix and no list of signatures; compare the whole header value as one digest.
- Only the body is signed. No timestamp, id or other header is part of the signed message, so there is no timestamp tolerance to enforce. Do not invent one from unsigned headers or body fields; use the payload `uuid` for idempotency instead.

Oh Dear has no verification SDK for Node or Python (its Laravel package verifies automatically), so these examples verify manually.

## How to Verify (Manual)

1. Read the **raw body bytes** exactly as received.
2. Take the header value, require exactly 64 hex characters, and lowercase it.
3. Compute `HMAC-SHA256(secret as UTF-8 bytes, raw body)`.
4. Compare the two digests as bytes in constant time.

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  if (!/^[0-9a-fA-F]{64}$/.test(signatureHeader || '')) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

Express must hand you the body as a `Buffer`: `express.raw({ type: '*/*' })`. In Next.js use `await request.arrayBuffer()`.

### Python

```python
import hashlib, hmac, re

def verify(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    if not signature_header or not re.fullmatch(r"[0-9a-fA-F]{64}", signature_header):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature_header), expected)
```

In FastAPI use `await request.body()`.

## Common Gotchas

- **Raw body**: never `JSON.parse` then `JSON.stringify` (or `json.dumps`) before verifying; whitespace and key order change the digest. Parse only after the check passes.
- **Validate before decoding**: `Buffer.from(sig, 'hex')` silently drops invalid characters, so check length and alphabet first.
- **Use bytes**: `hmac.compare_digest` on `bytes`, not `str` (non-ASCII `str` raises).
- **Secret is used as-is**: its UTF-8 bytes are the HMAC key.
- **Case**: compare hex case-insensitively (lowercase both sides or decode to bytes).
- **Respond 200**: redirects and other 2xx/3xx codes are failures for Oh Dear. After three failures that event is not resent.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Always `401` | Wrong secret (copy from the team's notification settings) or a body parser consumed the stream before `express.raw` |
| Fails only for some payloads | Body was re-serialized, or a proxy changed the body |
| `401` for every request after deploy | `OH_DEAR_WEBHOOK_SECRET` not loaded |
| Oh Dear shows a failed delivery with a redirect | Endpoint redirects (`http`→`https`, trailing slash); give Oh Dear the final URL |

Use **Show webhook log** in Oh Dear to compare the exact request with what your server received.
