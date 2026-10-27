# How to Verify Checkout Page Webhook Signatures

## How Does the Signature Work?

- Header: `x-webhook-signature: sha256=<64 hex>`
- Algorithm: HMAC-SHA256, lowercase hex digest
- Key: the webhook signing secret, as UTF-8 bytes (not decoded)
- Signed content: the raw request body bytes only

`x-webhook-timestamp` is sent but is **not** signed, and no id or other header is signed either. So
there is no signed replay window; dedupe on the body's `eventId` instead.

## Implementation

Checkout Page ships no webhook SDK, so verification is manual (the docs' Node sample is
`createHmac('sha256', secret).update(payload).digest('hex')`).

### Node.js

```javascript
const crypto = require('crypto');

function verifyCheckoutPageWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const match = /^(?:sha256=)?([0-9a-fA-F]{64})$/.exec(signatureHeader.trim());
  if (!match) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1].toLowerCase(), 'hex'), expected);
}
```

### Python

```python
import hashlib, hmac, re

def verify_checkout_page_webhook(raw_body: bytes, signature_header, secret) -> bool:
    if not signature_header or not secret:
        return False
    match = re.fullmatch(r"(?:sha256=)?([0-9a-fA-F]{64})", signature_header.strip())
    if not match:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(match.group(1)), expected)
```

## Common Gotchas

- **Raw bytes only.** Never `JSON.parse`/`JSON.stringify` (or decode and re-encode) before verifying. Use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` (Next.js) or `await request.body()` (FastAPI).
- **Validate before decoding.** Check the value is exactly 64 hex characters before `Buffer.from(x, 'hex')`, which silently drops bad characters.
- **Prefix is optional in the parser.** The header is `sha256=<hex>`; strip the prefix, and also accept a bare digest. Hex is case-insensitive, so lowercase before comparing.
- **Constant-time compare** on equal-length byte buffers (`timingSafeEqual`, `hmac.compare_digest` on bytes, never str).
- **Don't invent a replay window** from `x-webhook-timestamp` or body fields; they are unsigned.
- **Secret rotation** is immediate; update the env var at the same time.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Body parsed/re-serialised before verifying, or wrong secret (store vs page webhook) |
| Invalid after rotating | Old secret still deployed |
| Page-level webhook fails | Page-level `conversion` webhooks are a different delivery from store webhooks |
| 401 on every request | Header missing: check your proxy forwards `x-webhook-signature` |
