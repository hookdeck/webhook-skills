# Spacelift Signature Verification

## How Does Spacelift Sign Webhooks?

Spacelift states it uses "the exact same mechanism as GitHub":

- `X-Signature-256`: HMAC-SHA256 of the payload (the only header to verify)
- `X-Signature`: HMAC-SHA1 of the payload (not provided on FedRAMP; ignore it)

The key is the webhook's secret. The expected `X-Signature-256` value is `sha256=<lowercase hex>`. Spacelift's page doesn't print this format, so it is GitHub's format by reference: accept the value with or without the `sha256=` prefix (Hookdeck does too).

Only the raw body bytes are signed. There is no timestamp, id or other header in the signed content, so there's no replay window to enforce; don't invent one from unsigned fields.

## Implementation

Set a secret on the Spacelift webhook. Without one, deliveries are unsigned and fail verification.

### Node.js

```javascript
const crypto = require('crypto');

function verifySpaceliftSignature(rawBody, header, secret) {
  if (!secret || typeof header !== 'string') return false;
  const sig = header.trim().replace(/^sha256=/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(sig.toLowerCase(), 'hex'));
}
```

### Python

```python
import hashlib, hmac, re

def verify_spacelift_signature(raw_body: bytes, header, secret: str) -> bool:
    if not secret or not isinstance(header, str):
        return False
    sig = re.sub(r"^sha256=", "", header.strip(), flags=re.IGNORECASE)
    if not re.fullmatch(r"[0-9a-fA-F]{64}", sig):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode(), sig.lower().encode())
```

## Common Gotchas

- **Raw bytes.** Read the body as bytes (`express.raw({ type: '*/*' })`, `await request.arrayBuffer()`, `await request.body()`). Never decode and re-encode, or `JSON.parse`/`JSON.stringify`, before verifying.
- **Any method.** Verify on every method; an empty body is verified over zero bytes.
- **Secret as UTF-8.** Don't hex- or base64-decode it.
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops bad characters, so check length (64) and alphabet first.
- **Case.** Hex is compared case-insensitively; lower-case both sides.
- **No secret, no signature.** If the webhook has no secret, nothing is signed and verification fails: set one.
- **Rotation.** The secret can't be edited; delete and recreate the webhook.
- **Don't verify `X-Signature`.** It is SHA-1 and absent on FedRAMP.

## How Do I Debug Verification Failures?

1. Confirm the webhook has a secret and `SPACELIFT_WEBHOOK_SECRET` matches it exactly (no trailing newline).
2. Confirm `X-Signature-256` is present on the delivery (check the Hookdeck request or the Spacelift delivery log).
3. Make sure no middleware parsed or modified the body first.
4. Log the body length and compare with what was sent; recompute the HMAC with `openssl dgst -sha256 -hmac "$SECRET" body.bin`.
5. Return `401` for failures: Spacelift only retries `5xx`, and 10 consecutive failures disable the webhook.
