# How to Verify Proof Webhook Signatures

## How Does Proof Sign Webhooks?

Each request carries `X-Notarize-Signature`: the **lowercase hexadecimal HMAC-SHA256 of the raw
request body**. The header holds the bare 64-character digest: no `sha256=` prefix, no timestamp,
no list of signatures. Nothing besides the body is signed, so there is no replay window to check;
don't invent one from unsigned headers or body fields.

The key is your secret's UTF-8 bytes used as-is (not hex- or base64-decoded). It is the API key
that created the subscription, or its `signing_key` if one was set.

Paste the Proof API key that created the webhook, or its signing_key if you set one. Webhooks created with OAuth must set a signing_key.

## Implementation

Proof provides no SDK verifier and no test vector, so verify manually. Work on bytes, validate the
header's format before decoding it, then compare in constant time.

### Node.js

```javascript
const crypto = require('crypto');

function verifyProofSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) return false; // exact length and alphabet
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader.toLowerCase(), 'hex'); // 32 bytes, validated above
  return crypto.timingSafeEqual(expected, received);
}
```

Never call `Buffer.from(sig, 'hex')` on an unvalidated value: it silently drops bad characters.

### Python

```python
import hashlib, hmac, re

def verify_proof_signature(raw_body: bytes, signature: str | None, secret: str) -> bool:
    if not signature or not secret:
        return False
    if re.fullmatch(r"[0-9a-fA-F]{64}", signature) is None:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode("ascii"), signature.lower().encode("ascii"))
```

Compare `bytes`, never `str` (`compare_digest` raises on non-ASCII strings).

## Common Gotchas

- **Raw body only.** Read bytes exactly as received. Re-serialized JSON changes whitespace and key
  order and breaks the digest. Express: `express.raw({ type: '*/*' })`; Next.js:
  `request.arrayBuffer()`; FastAPI: `await request.body()`.
- **No header at all?** The subscription was created with OAuth and has no `signing_key`. Update
  it to add one; signing then cannot be turned off.
- **Wrong key.** The default key is the API key that *created* the subscription, not another key in
  the same account. A custom `signing_key` replaces it.
- **Case.** Compare hex case-insensitively (lowercase both sides, as Hookdeck does).
- **Status code.** Missing, empty, malformed or mismatched signature: `401`. Acknowledge valid
  deliveries with `200`; any other status is retried for up to 48 hours.

## How Do I Debug Verification Failures?

1. Log the header length: it must be 64 hex characters.
2. Sign the exact raw bytes you received with the secret and compare by eye.
3. Check for a body-parsing middleware ahead of the route that already consumed the stream.
4. Confirm the secret: the creating API key, or the `signing_key` from the create/update request.
5. Recreate the subscription with a known `signing_key` and replay a test event.
