# How to Verify Envoy Webhook Signatures

## How It Works

Every webhook carries:

```
X-Envoy-Signature: <base64 HMAC-SHA256 of the raw body>
```

- Algorithm: HMAC-SHA256
- Key: your Envoy app's client secret
- Signed content: the raw request body only (no timestamp, no id)
- Encoding: **base64** (not hex)

This matches Envoy's docs ("a Base64-encoded string that represents a SHA-256
HMAC of the request body, using your app's client secret as the key") and the
official `@envoy/envoy-integrations-sdk` `EnvoySignatureVerifier`
(`sha256`, `base64`, header `x-envoy-signature`). It does not use Standard
Webhooks.

> The docs page also shows a Ruby line hashing `timestamp + token`
> (`OpenSSL::HMAC.hexdigest(..., api_key, '%s%s' % [timestamp, token])`). That is
> Mailgun-style and does not describe Envoy webhooks; ignore it.

## Implementation

The Node SDK's verifier takes an Express request and the raw body, but the
examples verify directly so they work in Next.js and FastAPI too.

```javascript
const crypto = require('crypto');

function verifyEnvoySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

```python
import base64, hashlib, hmac

def verify_envoy_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest)
    # bytes on both sides: a non-ASCII header returns False instead of raising
    return hmac.compare_digest(signature.encode("utf-8"), expected)
```

Full handlers: [express](../examples/express/), [nextjs](../examples/nextjs/), [fastapi](../examples/fastapi/).

## Common Gotchas

- **Raw body.** Sign the exact bytes. In Express use
  `express.raw({ type: '*/*' })` so any Content-Type is captured; with
  `express.json()` the re-serialized body won't match.
- **Base64, not hex.** A hex digest will never match.
- **Compare the base64 strings, don't decode the header.** Compare equal-length
  UTF-8 buffers in constant time after a length check.
- **Client secret, not an API key or token.** Use the app's client secret.
- **No timestamp in the signature.** Replays can't be rejected by age, so dedupe
  deliveries yourself (Envoy retries failed ones).
- **Basic auth is separate.** If you configured `username:password` on the
  webhook URL, that is an extra check; the signature is still sent.

## Debugging Verification Failures

1. Is `X-Envoy-Signature` present?
2. Is the secret the app's client secret, with no stray whitespace?
3. Are you hashing the raw bytes, before any JSON parsing or middleware?
4. Is the digest base64?
5. Is a proxy rewriting the body? Compare the bytes you hash with what was sent.
