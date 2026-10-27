# How to Verify ReferralHero Webhook Signatures

## How Does ReferralHero Sign Webhooks?

When **Payload Verification** is enabled, each delivery carries:

```
X-ReferralHero-Signature: <base64>
```

The value is the standard, padded base64 encoding of `HMAC-SHA256(key = Webhook Secret Key, message = raw request body)`. It is 44 characters (`[A-Za-z0-9+/]{43}=`) with no prefix. ReferralHero's Ruby, Python and Node samples all base64-encode (`Base64.strict_encode64`, `base64.b64encode`, `digest('base64')`).

Nothing else is signed: no timestamp, id or other header. There is therefore no replay window to check. Don't invent one from unsigned headers or body fields.

## How Do I Verify It?

1. Read the **raw body bytes** exactly as received (`express.raw({ type: '*/*' })`, `await request.arrayBuffer()`, `await request.body()`).
2. Read `X-ReferralHero-Signature`. Missing or empty: `401`.
3. Check the format: exactly 44 characters matching `[A-Za-z0-9+/]{43}=`. Otherwise `401`.
4. Compute the HMAC-SHA256 of the raw bytes with the secret's UTF-8 bytes as the key, and base64 encode it.
5. Compare in constant time. Mismatch: `401`.
6. Only then parse the JSON.

### Node.js

```javascript
const crypto = require('crypto');

function verifyReferralHeroSignature(rawBody, signature, secret) {
  if (!signature || !secret || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import base64, hashlib, hmac, re

def verify_referralhero_signature(raw_body: bytes, signature: str | None, secret: str) -> bool:
    if not signature or not secret or re.fullmatch(r"[A-Za-z0-9+/]{43}=", signature) is None:
        return False
    try:
        received = base64.b64decode(signature, validate=True)
    except ValueError:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(received, expected) and hmac.compare_digest(
        base64.b64encode(received), signature.encode("ascii")
    )
```

ReferralHero has no official verification SDK; the documented method is manual HMAC.

## Common Gotchas

- **Payload Verification is off by default.** Unsigned deliveries have no signature header, so verification fails with `401`. Turn the toggle on and paste the secret.
- **Wrong secret.** Use the Webhook Secret Key, not the API key, even though ReferralHero's samples name the variable `REFERRALHERO_API_KEY`.
- **Parsed body.** Re-serialised JSON has different bytes (key order, whitespace). Verify first, parse second.
- **Don't decode the secret.** It is used as its UTF-8 bytes, not base64- or hex-decoded.
- **Hex vs base64.** The digest is base64. A hex digest never matches.
- **Non-canonical base64.** A final character with stray low bits decodes to the same bytes but is not the canonical text, so Hookdeck rejects it. Compare the text exactly (or the bytes and the re-encoded text) rather than only decoded bytes.
- **Never `Buffer.from(sig, 'base64')` on unvalidated input.** It silently drops bad characters.
- **Status codes.** `401` for a bad or missing signature; `200` with a blank body on success.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| No `X-ReferralHero-Signature` header | Payload Verification is off for that webhook |
| Signature present but never matches | Wrong secret (API key, or an old secret after regenerating), or body parsed before verifying |
| Fails only in some environments | A proxy or framework rewrote the body; verify the untouched bytes |
| Matches locally, fails with Hookdeck | Source verification not configured with the same Webhook Secret Key |
