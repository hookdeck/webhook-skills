# How to Verify Help Scout Webhook Signatures

## How It Works

- Header: `X-HelpScout-Signature`
- Algorithm: HMAC-SHA1
- Key: the webhook secret key you entered in Workspace > Apps > Webhooks
- Signed content: the **raw request body**, exactly as received (no timestamp or id is included)
- Encoding: **base64** of the raw digest (not hex)

Compute the HMAC of the raw body, base64-encode it, and compare it to the header with a constant-time comparison.

## Implementation

Help Scout provides a PHP library and a Java class that verify for you, but no Node.js or Python SDK, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyHelpScoutWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('base64');
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

def verify_helpscout_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = base64.b64encode(
        hmac.new(secret.encode(), raw_body, hashlib.sha1).digest()
    ).decode()
    return hmac.compare_digest(signature_header, expected)
```

### Test vector (from the Help Scout docs)

- Secret: `your secret key`
- Body: `{"ticket":{"id":"1","number":"2"},"customer":{"id":"1","fname":"Jackie","lname":"Chan","email":"jackie.chan@somewhere.com","emails":["jackie.chan@somewhere.com"]}}`
- Signature: `I1KlvGppYqvFTJgJ9jezdQMDiyI=`

## Common Gotchas

- **Raw body only.** Do not parse and re-stringify JSON. Help Scout signs the body as sent, including escaped non-ASCII characters. In Express use `express.raw({ type: '*/*' })` so any content type verifies.
- **Base64, not hex.** Comparing against a hex digest always fails.
- **SHA1, not SHA256.** This is Help Scout's documented algorithm.
- **No timestamp.** There is no replay window in the signature, so dedupe in your handler.
- **Status codes.** Return 400 for a bad signature. A 410 response deletes the webhook.
- **Event name is a header.** Read `X-HelpScout-Event`, not the body.

## Debugging Verification Failures

1. Confirm the secret in your environment matches the one in the Webhooks app exactly, with no trailing whitespace or quotes.
2. Log the length of the raw body and compare it with the request in the Hookdeck CLI web UI. A mismatch means middleware changed the body.
3. Check that no JSON body parser runs before your route.
4. Recompute the test vector above in your code. If it matches, the problem is the secret or the body, not the algorithm.
