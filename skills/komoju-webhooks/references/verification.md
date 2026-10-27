# How to Verify KOMOJU Webhook Signatures

## How It Works

- Header: `X-Komoju-Signature`, the bare lowercase hex digest, **no prefix** (64 hex characters)
- Algorithm: HMAC-SHA256, hex encoded (KOMOJU's prose says "SHA-2 HMAC"; its Ruby sample fixes it as
  `OpenSSL::HMAC.hexdigest('sha256', WEBHOOK_SECRET_TOKEN, request_body)`)
- Signed content: the **raw request body bytes** only. No timestamp, id or other header is signed
- Key: the webhook's secret token, used as its UTF-8 bytes (not hex- or base64-decoded)
- The header is only sent when a secret token is set. Set a secret token on the KOMOJU webhook.
  Without one, deliveries are unsigned and fail verification.
- Not the Standard Webhooks spec
- Compare the whole header value as one digest; hex is case-insensitive

## Implementation

KOMOJU's docs show only a manual Ruby example, so verify manually.

Node:

```javascript
const crypto = require('crypto');

function verifyKomojuSignature(rawBody, signatureHeader, secret) {
  if (typeof signatureHeader !== 'string' || !/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  const received = Buffer.from(signatureHeader.toLowerCase());
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

Python:

```python
import hashlib, hmac, re

def verify_komoju_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    if not signature_header or not re.fullmatch(r"[0-9a-fA-F]{64}", signature_header, re.ASCII):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest().encode("ascii")
    return hmac.compare_digest(signature_header.lower().encode("ascii"), expected)
```

Respond `401` for a missing, empty, malformed or mismatched signature.

## Common Gotchas

- **Raw body first.** KOMOJU's sample stresses using the raw, unmodified request body. Parsing then re-serializing JSON changes bytes (KOMOJU's payloads contain `\u` escapes for Japanese text). With Express use `express.raw({ type: '*/*' })`, not `express.json()`.
- **Bytes, not strings.** Do not decode the body to a string and re-encode it.
- **Validate before decoding.** In Node, `Buffer.from(sig, 'hex')` silently drops invalid characters. Check the exact length (64) and alphabet first, as above.
- **Constant-time compare.** Use `crypto.timingSafeEqual` or `hmac.compare_digest`. In Python compare bytes, since `str` input with non-ASCII characters raises `TypeError`.
- **No replay window.** No timestamp is signed, so don't invent one. Deduplicate on the body's event `id`.
- **Unsigned webhooks.** A webhook without a secret token sends no signature header, so every delivery would be rejected with 401.
- **IP allowlisting.** KOMOJU publishes its sender IPs but recommends against IP-based access control and says the list may change without notice; rely on the signature.
- **Per-payment webhooks** use their own `secret_key`, so a payment may be signed with a different secret than the dashboard webhooks.

## Debugging Verification Failures

1. Header missing or empty: no secret token is set on the webhook, or a proxy stripped the header.
2. Mismatch: confirm you are using the secret token of *this* webhook (secrets differ per webhook).
3. Mismatch on every request: a JSON body parser consumed the stream; read the raw bytes instead.
4. Proxy or Hookdeck in front: paste the same secret token into the Hookdeck source verification settings.
