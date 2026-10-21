# Bolt Signature Verification

## How Does Bolt Sign Webhooks?

Bolt computes HMAC-SHA256 over the **raw request body**, using your Signing Secret as the key, base64-encodes the digest, and sends it in the `X-Bolt-Hmac-Sha256` header. The same scheme signs Merchant Callbacks.

- Header: `X-Bolt-Hmac-Sha256` (lowercase `x-bolt-hmac-sha256` in most frameworks)
- Algorithm: HMAC-SHA256
- Encoding: base64 (not hex)
- Signed content: the raw body only (no timestamp or id prefix)
- Secret: Signing Secret from Merchant Dashboard > Administration > API, used as a raw string
- Standard Webhooks: **no**. Bolt has no `webhook-id`, `webhook-timestamp`, or `webhook-signature` headers.
- Bolt publishes no verification SDK, so use manual verification in every framework.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyBoltWebhook(rawBody, hmacHeader, secret) {
  if (!hmacHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}
```

### Python

```python
import base64, hashlib, hmac

def verify_bolt_webhook(raw_body: bytes, hmac_header: str, secret: str) -> bool:
    if not hmac_header or not secret:
        return False
    expected = base64.b64encode(hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()).decode()
    return hmac.compare_digest(expected.encode(), hmac_header.encode())
```

Framework wiring: Express `express.raw({ type: '*/*' })`, Next.js App Router `await request.text()`, FastAPI `await request.body()`. See the `examples/` directories.

## Common Gotchas

- **Raw body**: parsing and re-serializing JSON changes the bytes and the signature will not match.
- **Base64, not hex**: compare against a base64 digest.
- **Length mismatch**: `crypto.timingSafeEqual` throws when buffer lengths differ; catch it or compare lengths first.
- **Secret handling**: don't decode or trim the Signing Secret; sandbox and production secrets differ.
- **No replay protection**: there is no timestamp, so dedupe on `type` + `data.id`/`data.reference`.
- **Response**: reply 200 with valid JSON, or Bolt retries with exponential back-off.

## Debugging Verification Failures

1. Log the raw body length and confirm no middleware parsed it first.
2. Confirm you're using the Signing Secret for the same environment (sandbox vs production) as the sending dashboard.
3. Compute the digest by hand: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64`.
4. If a proxy or gateway sits in front, make sure it forwards the body byte for byte and keeps the `X-Bolt-Hmac-Sha256` header.
5. Use the dashboard's webhook events view to see the error and resend.
