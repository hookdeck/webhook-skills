# Flexport Signature Verification

## How It Works

Flexport signs every webhook delivery with an HMAC of the **raw request body**,
keyed on the endpoint's **secret token**. It sends two GitHub/X-Hub-style
headers, each a hex digest prefixed with the algorithm name:

| Header | Algorithm | Format | Status |
|--------|-----------|--------|--------|
| `X-Hub-Signature-256` | HMAC-SHA256 | `sha256=<hexdigest>` | **Recommended** |
| `X-Hub-Signature` | HMAC-SHA1 | `sha1=<hexdigest>` | Legacy |

The signed string is the raw request body bytes, so you must compute the HMAC
over the **raw bytes received**, before any JSON parsing or re-serialization.

This is Flexport's own scheme (the same shape GitHub and Facebook use), **not**
the Standard Webhooks spec — there are no `webhook-id` / `webhook-timestamp` /
`webhook-signature` headers.

There is **no official Flexport SDK**, so verify manually in every framework.

## Implementation

### Manual Verification (Node.js)

```javascript
const crypto = require('crypto');

function verifyFlexportWebhook(rawBody, signatureHeader, secret) {
  // signatureHeader looks like "sha256=<hex>"
  const [algo, sig] = (signatureHeader || '').split('=');
  if (algo !== 'sha256' || !sig) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)          // rawBody is a Buffer / raw bytes
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;             // length mismatch / bad hex = invalid
  }
}
```

### Manual Verification (Python)

```python
import hmac
import hashlib

def verify_flexport_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    algo, _, sig = (signature_header or "").partition("=")
    if algo != "sha256" or not sig:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)
```

## Common Gotchas

- **Use the raw body, not parsed JSON.** Re-serializing the parsed object changes
  whitespace/key order and breaks the HMAC. Capture the raw bytes before parsing
  (`express.raw`, `await request.text()`, `await request.body()`).
- **Strip the `sha256=` prefix.** The header value is `sha256=<hex>`, not a bare
  digest. Compare only the hex portion.
- **Hex encoding, not base64.** Flexport uses hex digests (like GitHub), unlike
  Shopify which uses base64.
- **Prefer `X-Hub-Signature-256`.** Flexport calls the `X-Hub-Signature` (SHA-1)
  header legacy and asks integrations to move to SHA-256. If you also support SHA-1 during migration, use
  the same raw-body/HMAC approach with `sha1`.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`,
  and guard against buffer-length mismatches (wrap in try/except).
- **Header case.** HTTP headers are case-insensitive; most frameworks lowercase
  them (`x-hub-signature-256`).

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Always fails, even with the right secret | Body was parsed/re-serialized before hashing — hash the raw bytes |
| Fails intermittently | A proxy or body parser is mutating the payload before your handler |
| `timingSafeEqual` throws | Comparing buffers of different lengths — decode both as hex and catch the error |
| Works locally, fails in prod | Wrong `FLEXPORT_WEBHOOK_SECRET` for that endpoint (each endpoint has its own token) |
| Header missing | Reading the wrong header name, or the request didn't come from Flexport |
