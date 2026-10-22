# How to Verify Workable Webhook Signatures

## How It Works

Workable computes HMAC-SHA256 over the raw request body and sends the result in `X-Workable-Signature`. The key is the account API token that created the subscription, or the OAuth application secret for OAuth apps. Nothing else is signed: there is no timestamp or message ID.

## Digest Encoding

Workable's docs don't state the encoding. These examples use lowercase hex, which matches the maintained n8n and Botpress Workable integrations. If you ever see consistent mismatches with the right key, test the base64 digest as well.

## Implementation

Workable has no webhook verification SDK, so verify manually.

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, key) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader.toLowerCase()), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

```python
import hmac, hashlib

def verify(raw_body: bytes, signature_header: str, key: str) -> bool:
    expected = hmac.new(key.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest((signature_header or "").lower().encode(), expected.encode())
```

## Common Gotchas

- **Raw body, any content type.** Don't parse JSON first. In Express use `express.raw({ type: '*/*' })`; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **The key is your API token (or OAuth app secret),** not a value shown on a webhook page. Rotating the token changes the signature key.
- **No replay protection.** There is no timestamp, so make handlers idempotent.
- **Return `200`** or Workable replays the request.

## Debugging Verification Failures

- Confirm you're using the token that created the subscription (or the OAuth app secret), with no `Bearer ` prefix or whitespace.
- Log the length and first bytes of the raw body to make sure no middleware re-serialized it.
- Compare the hex digest case-insensitively.
