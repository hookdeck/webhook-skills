# SavvyCal Signature Verification

## How Does SavvyCal Sign Webhooks?

SavvyCal computes an HMAC-SHA256 of the **raw request body**, keyed with the webhook's secret, and sends it in the `x-savvycal-signature` header. Nothing else (no timestamp, no webhook id) is part of the signed content, and there is no SDK helper.

## What Format Is the Header?

The docs are inconsistent:

- The sample request shows `x-savvycal-signature: sha256=6CAA4DEF...` (prefix, **uppercase** hex).
- The Elixir sample computes `Base.encode16()` (uppercase hex) and compares it to the header with no prefix handling.

So accept both. Strip an optional `sha256=` prefix and compare the hex digest case-insensitively. Reject anything that is not 64 hex characters after that.

## Implementation (manual)

### Node.js

```javascript
const crypto = require('crypto');

function verifySavvyCalSignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const received = header.trim().replace(/^sha256=/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
}
```

### Python

```python
import hashlib, hmac, re

def verify_savvycal_signature(raw_body: bytes, header: str | None, secret: str) -> bool:
    if not header or not secret:
        return False
    received = re.sub(r"^sha256=", "", header.strip(), flags=re.IGNORECASE).lower()
    if not re.fullmatch(r"[0-9a-f]{64}", received):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode(), received.encode())
```

## Common Gotchas

- **Use the raw body.** Re-serialized JSON changes whitespace and key order and breaks the HMAC. In Express use `express.raw({ type: '*/*' })` so any content type verifies; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Don't compare case-sensitively.** The documented digest is uppercase; most HMAC libraries emit lowercase.
- **Don't forget the `sha256=` prefix.** Strip it if present, but don't require it.
- **No replay window.** The signature has no timestamp, so dedupe on the payload `id` if replays matter.
- **Secret is per webhook.** If you run several webhooks, each has its own secret.

## Debugging Verification Failures

1. Log the received header and your computed digest (never the secret) and compare them after lowercasing and stripping the prefix.
2. Confirm the secret is the one shown for *this* webhook in Settings > Integrations, with no surrounding whitespace.
3. Confirm nothing (a body parser, proxy, or middleware) modified the body before verification.
4. Test with the Hookdeck CLI (`npx hookdeck-cli listen 3000 savvycal --path /webhooks/savvycal`) to inspect the exact request SavvyCal sent.
