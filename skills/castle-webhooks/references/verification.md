# Castle Signature Verification

## How Does Castle Sign Webhooks?

- Header: `X-Castle-Signature`
- Algorithm: HMAC-SHA256
- Signed content: the **raw JSON request body** (no timestamp, no prefix)
- Key: your Castle **API secret** (not a per-webhook secret)
- Encoding: **base64** (not hex)

Castle's docs describe the check as optional but highly recommended.

## Implementation

Castle's documentation only provides a Ruby sample, so verify manually. Compute the HMAC, base64-encode it, and compare with timing-safe equality.

### Node.js

```javascript
const crypto = require('crypto');

function verifyCastleSignature(rawBody, signatureHeader, apiSecret) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', apiSecret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import base64, hashlib, hmac

def verify_castle_signature(raw_body: bytes, signature: str, api_secret: str) -> bool:
    expected = base64.b64encode(
        hmac.new(api_secret.encode(), raw_body, hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(signature, expected)
```

## Common Gotchas

- **Raw body**: hash the exact bytes received. Re-serialized JSON changes whitespace and key order and breaks the match.
- **Base64, not hex**: comparing against a hex digest always fails.
- **API secret**: using a different key (or a test-environment secret against production traffic) fails verification.
- **No timestamp**: Castle sends none, so replay protection must come from idempotency (dedupe on `data.event.id` / `data.id` plus `type`).
- **Header casing**: frameworks lowercase header names (`x-castle-signature`).
- **Trailing newline**: the Ruby sample uses `encode64(...).strip`; strip any newline if your base64 helper adds one.

## Debugging Verification Failures

1. Log the raw body length and confirm no middleware parsed it first.
2. Confirm `CASTLE_API_SECRET` matches the environment (production vs sandbox) that sent the webhook.
3. Recompute the digest locally with the same body and compare the base64 strings.
4. Use the Hookdeck CLI to inspect and replay the exact request: `npx hookdeck-cli listen 3000 castle --path /webhooks/castle`.
