# How to Verify Stedi Webhook Signatures

## How Does Stedi Sign Webhooks?

Stedi follows the Standard Webhooks specification.

1. Take `webhook-id` (`msg_{UUID}`), `webhook-timestamp` (Unix seconds) and the **raw** request body.
2. Build the signed content: `{webhook-id}.{webhook-timestamp}.{raw body}`.
3. Compute HMAC-SHA256 over it. The key is the **base64-decoded** part of the destination secret after the `whsec_` prefix.
4. Base64-encode the digest. The header carries `v1,<that value>`; during secret rotation it carries several entries separated by spaces.
5. Compare in constant time against every `v1` entry. Any match is valid.

### The docs' manual steps differ

Stedi's page says to build `signed_payload` as `timestamp + '.' + body`, with no message ID. That text doesn't match the Standard Webhooks spec, or the `standardwebhooks` library the same page uses for its TypeScript example. Use `id.timestamp.body`. The tests in the examples assert that the no-id variant is rejected.

## Manual Verification

### Node.js

```javascript
const crypto = require('crypto');

function verifyStediWebhook(rawBody, headers, secret, toleranceSeconds = 0) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const header = headers['webhook-signature'];
  if (!id || !timestamp || !header) return false;
  if (toleranceSeconds > 0 &&
      Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${timestamp}.`).update(rawBody).digest();

  return header.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    const received = Buffer.from(sig || '', 'base64');
    return version === 'v1' && received.length === expected.length &&
      crypto.timingSafeEqual(received, expected);
  });
}
```

### Python

```python
import base64, hashlib, hmac

def verify_stedi_webhook(raw_body: bytes, msg_id: str, timestamp: str, header: str, secret: str) -> bool:
    key = base64.b64decode(secret.removeprefix("whsec_"))
    expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()
    for entry in header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(base64.b64decode(sig), expected):
            return True
    return False
```

## SDK / Library Verification

The docs verify with the `standardwebhooks` package (npm and PyPI):

```javascript
const { Webhook } = require('standardwebhooks');
new Webhook(secret).verify(rawBody, {
  'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature,
}); // returns the parsed body, throws on failure
```

```python
from standardwebhooks.webhooks import Webhook
Webhook(secret).verify(raw_body, {"webhook-id": ..., "webhook-timestamp": ..., "webhook-signature": ...})
```

It handles rotation and constant-time comparison, but its timestamp window is fixed at 5 minutes (no option to turn it off). That's fine if you only want fresh deliveries. Stedi's `webhook-timestamp` is the **event creation** time, and automatic retries (5 min, 30 min, 2 h, 8 h, 24 h, 48 h) and manual recoveries keep it, so the library rejects all of them. Stedi's docs even note recovered events will "likely be outside your normal tolerance window". If you use the library, return 2xx only after verifying with your own check for those cases, or use the manual version above.

## Common Gotchas

- **Raw body.** Hash the exact bytes. In Express use `express.raw({ type: '*/*' })` so any content type is verified. In Next.js use `await request.text()`. In FastAPI use `await request.body()`.
- **Decode the secret.** The key is the base64-decoded bytes, not the `whsec_...` string.
- **Include the message ID** in the signed content.
- **Multiple signatures.** During rotation any `v1` entry may match.
- **Timestamp tolerance.** Optional replay protection must account for retries up to 48 hours old. Dedupe on `webhook-id` instead.
- **Constant-time compare**, and guard against length mismatches (`timingSafeEqual` throws).

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always fails | Body parsed and re-serialised, or key not base64-decoded |
| Fails only on retries or recovered events | A 5-minute window (library default) against a creation timestamp |
| Fails right after rotating | Old secret still in use after its expiry, or only the first signature checked |
| Works for ping, fails in production | Using the wrong destination's secret (each destination has its own) |
| Fails behind a proxy | Middleware altering the body, or a WAF blocking `Stedi-Events/` requests |

Review the exact request Stedi sent (headers and body) on the destination's **Event deliveries** tab.
