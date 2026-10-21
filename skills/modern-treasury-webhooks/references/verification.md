# Modern Treasury Signature Verification

## How Does Modern Treasury Sign Webhooks?

Every webhook carries an `X-Signature` header: the **hex-encoded HMAC-SHA256 of the request body**, keyed with your webhook key (Developers > Webhooks). Nothing else is signed: there is no timestamp, no webhook ID and no `v1=` prefix. The documented shell equivalent is:

```bash
echo -n "{...}" | openssl dgst -sha256 -hmac "WEBHOOK_KEY"
```

To verify: compute the HMAC over the exact raw bytes received, hex-encode it, and compare it to `X-Signature` in constant time.

## Implementation

### Manual verification (used by all three examples)

```javascript
const crypto = require('crypto');

function verifySignature(rawBody, signature, webhookKey) {
  if (!signature || !webhookKey) return false;
  const expected = crypto.createHmac('sha256', webhookKey).update(rawBody).digest('hex');
  const received = Buffer.from(signature.trim().toLowerCase());
  const expectedBuf = Buffer.from(expected);
  return received.length === expectedBuf.length &&
    crypto.timingSafeEqual(received, expectedBuf);
}
```

```python
import hashlib, hmac

def verify_signature(raw_body: bytes, signature: str, webhook_key: str) -> bool:
    expected = hmac.new(webhook_key.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.strip().lower().encode(), expected.encode())
```

### Official SDK helpers (not used in the examples)

- Node: `client.webhooks.validateSignature(payload: string, headers, { key })` and `getSignature(payload, { key })` in the `modern-treasury` package. The key defaults to `MODERN_TREASURY_WEBHOOK_KEY` or the client's `webhookKey` option.
- Python: `client.webhooks.validate_signature(payload, headers, key=...)` and `get_signature(...)` in the `modern_treasury` package.

Both take the payload as a **string** and compare with plain `===` / `==` (not constant-time), and you must construct a client first. Using `getSignature` plus your own timing-safe compare is a valid alternative.

## Common Gotchas

- **Raw body.** Do not parse and re-serialize. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Header case in Node.** Node lowercases incoming header names. The Modern Treasury docs' Express sample reads `req.headers['X-Signature']`, which is always `undefined`; use `req.headers['x-signature']`.
- **Key is a raw string.** Do not base64-decode it or strip a prefix.
- **Throwing inside `express.json({ verify })`.** The docs sample throws in the verify callback, which yields a 500 by default; the examples return an explicit 400 instead.
- **`X-Internal-Signature`.** Ignore it; it is not for customers.
- **No replay protection in the signature.** Deduplicate on `X-Webhook-ID`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Body was parsed/re-serialized, or a proxy altered it |
| Always invalid | Wrong key (sandbox vs production key, or a rotated key) |
| `signature` undefined in Node | Looked up `X-Signature` instead of `x-signature` |
| Invalid only for some requests | Middleware (e.g. `express.json()`) registered before the raw parser on this route |
| `timingSafeEqual` throws | Length not checked before comparing |

To confirm the algorithm, sign a captured raw body locally with the commands above and compare it to the delivery's `X-Signature` in the endpoint's delivery log.
