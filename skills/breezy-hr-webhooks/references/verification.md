# How to Verify Breezy HR Webhook Signatures

## How Does Breezy HR Sign Webhooks?

Every delivery carries an `X-Hook-Signature` header: the **lowercase hex**
HMAC-SHA256 of the request body, with no `sha256=` prefix. The key is the secret
returned when you created the endpoint (`whsec_...`). A second header,
`X-Breezy-Webhook-Version`, identifies the payload format. There is no timestamp
or message ID in the signature, so there is no replay window to enforce; use the
envelope `_id` for deduplication.

## Why Is the whsec_ Secret Not Standard Webhooks?

The `whsec_` prefix matches Svix / Standard Webhooks, but Breezy treats the
secret as an ordinary string. Breezy's Python sample is `secret.encode('utf-8')`.
So:

- Do not use the `standardwebhooks` or `svix` libraries
- Do not strip `whsec_`
- Do not base64-decode the secret
- There are no `webhook-id` / `webhook-timestamp` / `webhook-signature` headers

## Implementation

There is no Breezy SDK for verification, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyBreezySignature(rawBody, signature, secret) {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signature.trim().toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hashlib, hmac

def verify_breezy_signature(raw_body: bytes, signature: str | None, secret: str) -> bool:
    if not signature:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip().lower())
```

## Common Gotchas

- **Raw body vs re-serialized JSON.** Breezy's code samples call
  `JSON.stringify(req.body)` / `json.dumps(body, separators=(',', ':'))`, but
  their troubleshooting text says the signature is computed on the raw JSON body,
  not a re-serialized one. Verify the raw bytes. Re-serializing only matches if
  your serializer reproduces Breezy's exact bytes.
- **Express content type.** Use `express.raw({ type: '*/*' })` so the body stays
  a `Buffer` whatever `Content-Type` is sent. `express.json()` before the route
  breaks verification.
- **Next.js:** read `await request.text()`, not `request.json()`.
- **FastAPI:** read `await request.body()` before parsing.
- **Whole secret.** Keep the `whsec_` prefix.
- **Length check.** `crypto.timingSafeEqual` throws on unequal lengths, so check
  length first.
- **Status codes.** Return 400 for a bad or missing signature and 2xx on success;
  Breezy retries anything else up to 10 times.

## Debugging Verification Failures

1. Print the secret's first 6 characters: it should be `whsec_`.
2. Compare the length of the raw body you verify with the `Content-Length` header.
3. Check that no middleware parsed or modified the body.
4. Check the header name: `x-hook-signature` (case-insensitive).
5. Recompute with the secret from the endpoint-creation response; the secret
   cannot be fetched again, so create a new endpoint if it is lost.
