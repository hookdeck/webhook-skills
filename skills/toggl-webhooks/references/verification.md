# How to Verify Toggl Track Webhook Signatures

## How It Works

Toggl adds an `X-Webhook-Signature-256` header to each delivery:

```
X-Webhook-Signature-256: sha256=<hex>
```

`<hex>` is the HMAC-SHA256, hex-encoded, of the **full unparsed request body**, keyed with the subscription secret. There is no timestamp or message id in the signed content.

## Implementation

Toggl publishes no SDK for this; verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyTogglWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false; // length mismatch
  }
}
```

### Python

```python
import hmac, hashlib

def verify_toggl_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    if not signature_header or not secret:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.encode(), expected.encode())
```

### Test Vector (from Toggl's docs)

- Secret: `PGuRrhCFajIyEvFlreKL`
- Body: `{"event_id":0,"created_at":"2022-06-25T03:58:10.207820267Z","creator_id":6,"metadata":{"request_type":"POST","event_user_id":6},"payload":"ping","subscription_id":6,"timestamp":"2022-06-25T03:58:10.207820267Z","url_callback":"https://callback-url.com"}`
- Header: `sha256=bf829606cda0ca6923defb5ca70a43135adc7e8887486a201a19cb50ca6006b1`

## Common Gotchas

- **Raw body:** hash the exact bytes received. Re-serialising parsed JSON changes key order and whitespace. In Express use `express.raw({ type: '*/*' })`; Toggl sends `application/json`, but this verifies any content type.
- **Header prefix:** the value includes `sha256=`; compare with the prefix, or strip it from both sides.
- **Case:** header names are case-insensitive (`x-webhook-signature-256` in Node and FastAPI).
- **Auto-generated secrets:** if you didn't set `secret`, the verification key is the one Toggl generated.

## Optional Replay and Misrouting Checks

Toggl documents two extra checks: reject events whose `timestamp` is old (allow about a minute of skew; it is refreshed on each retry), and compare `url_callback` with your expected URL, which matters if subscriptions share a secret. Prefer a unique secret per subscription.

## Debugging Verification Failures

- **Invalid signature on every request:** wrong secret, or a middleware parsed the body before verification.
- **Only PING fails:** you may be verifying against a re-serialised body.
- **Subscription never receives events:** it isn't validated yet; see [setup.md](setup.md).
