# How to Verify Chameleon Webhook Signatures

## How It Works

Chameleon computes `HMAC-SHA256(key = Webhook Secret, message = raw request body)` and sends the
lowercase hex digest in the `X-Chameleon-Signature` header. There is no prefix, no timestamp, and
no list of signatures: the header value is one 64-character hex digest. Nothing but the body is signed.

Chameleon's own sample (Rails):

```ruby
expected = OpenSSL::HMAC.hexdigest('SHA256', secret, request.raw_post)
verified = ActiveSupport::SecurityUtils.secure_compare(received, expected) &&
  (sent_at = Time.zone.parse(params[:sent_at])) &&
  (sent_at > 5.minutes.ago && sent_at < 5.minutes.from_now)
```

The first half is the signature check. The `sent_at` window is a second, replay-protection step
that the docs recommend. `sent_at` lives in the body, so it is covered by the signature.

## Implementation

Chameleon has no webhook-verification SDK, so verification is manual.

### Node.js

```javascript
const crypto = require('crypto');
const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

function verifyChameleonSignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string' || !HEX_SHA256.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}
```

### Python

```python
import hashlib, hmac, re

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")

def verify_chameleon_signature(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    if not secret or not signature or not HEX_SHA256.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.lower().encode("ascii"), expected.encode("ascii"))
```

### Optional `sent_at` check

After the signature passes, parse the body and reject (`400`) if `sent_at` is more than N seconds
from now (Chameleon's sample uses 300). The examples do this only when
`CHAMELEON_SENT_AT_TOLERANCE_SECONDS` is set. Keep it off unless you want it: Chameleon retries
failed deliveries over 43 hours, so a retry can arrive long after `sent_at` and a window may reject
it after an outage.

## Common Gotchas

- **Raw body.** Sign the bytes as received. Parsing and re-serializing JSON changes whitespace and key
  order. In Express use `express.raw({ type: '*/*' })`; in Next.js `await request.arrayBuffer()`; in
  FastAPI `await request.body()`.
- **Secret is text.** Don't hex- or base64-decode the Webhook Secret.
- **Bare hex.** There is no `sha256=` prefix to strip.
- **Don't decode unvalidated hex.** `Buffer.from(sig, 'hex')` silently drops bad characters, so check
  the 64-hex-character format first.
- **Case.** Hex is compared case-insensitively; lowercase or decode both sides.
- **Status code.** The examples answer `401` for a bad signature. Chameleon's guidance says `400`;
  either is non-2xx and gets retried.
- **Which secret.** One Webhook Secret per account, from Integrations -> Webhooks.

## How to Debug Verification Failures

1. Log the raw body length and the received header; confirm the header is 64 hex characters.
2. Check the framework isn't parsing the body first (the body must be a `Buffer`/`bytes`).
3. Recompute the digest by hand: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$CHAMELEON_WEBHOOK_SECRET"`.
4. Make sure the secret has no stray whitespace or quotes from your `.env`.
5. If a proxy or gateway sits in front, make sure it forwards the body unmodified.
