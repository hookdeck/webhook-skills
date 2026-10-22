# How to Verify Codat Webhook Signatures

## How Does Codat Sign Webhooks?

Codat delivers webhooks through Svix, which signs every request using the [Standard Webhooks](https://www.standardwebhooks.com/) scheme. Each endpoint has a unique signing secret (`whsec_...`). The headers are `webhook-*`, **not** `svix-*`:

| Header | Value |
|--------|-------|
| `webhook-id` | Unique message ID, the same on every retry of that message |
| `webhook-timestamp` | Unix timestamp (seconds) of this delivery attempt |
| `webhook-signature` | Space-separated list of `v1,<base64 signature>` entries |

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The request is valid when any `v1,` entry matches (several appear during secret rotation).

## Why Does Signature Verification Matter?

Your endpoint URL is public. Without verification, anyone can POST a fake `read.completed` or `connection.connected` event. The timestamp check also limits replay of captured requests.

## Implementation

### Library Verification (recommended)

Use the Standard Webhooks library ([`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) on npm, [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) on PyPI). It reads the `webhook-*` headers directly and returns the parsed payload.

```javascript
const { Webhook } = require('standardwebhooks');

// rawBody: the exact request body string, NOT re-serialised JSON
const event = new Webhook(process.env.CODAT_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws on bad signature or a timestamp more than 5 minutes off
```

```python
from standardwebhooks.webhooks import Webhook

event = Webhook(os.environ["CODAT_WEBHOOK_SECRET"]).verify(
    await request.body(),
    {
        "webhook-id": request.headers["webhook-id"],
        "webhook-timestamp": request.headers["webhook-timestamp"],
        "webhook-signature": request.headers["webhook-signature"],
    },
)
```

### Manual Verification

Use this if you can't add a dependency:

```javascript
const crypto = require('crypto');

function verifyCodat(rawBody, id, timestamp, signatureHeader, secret) {
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const received = Buffer.from(sig, 'base64');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}
```

```python
import base64, hashlib, hmac, time

def verify_codat(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str, secret: str) -> bool:
    if abs(time.time() - int(timestamp)) > 300:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    return any(
        version == "v1" and hmac.compare_digest(sig, expected)
        for version, _, sig in (entry.partition(",") for entry in signature_header.split(" "))
    )
```

## Common Gotchas

- **Raw body.** The HMAC covers the exact bytes Codat sent. In Express use `express.raw({ type: '*/*' })` so any content type verifies; in Next.js `await request.text()`; in FastAPI `await request.body()`.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string.
- **One secret per endpoint.** A staging endpoint's secret won't verify production deliveries.
- **Multiple signatures.** During rotation `webhook-signature` holds several space-separated entries. Accept the request if any `v1,` entry matches.
- **Header names.** Codat uses `webhook-*`. Don't look for `svix-*` headers.
- **Timestamp tolerance.** The library rejects timestamps more than 5 minutes from your server clock. Keep the clock in sync with NTP. Retries are re-signed with a fresh timestamp.

## How Do I Debug Codat Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong endpoint's secret, `whsec_` prefix not stripped or key not base64-decoded, or the body was parsed before verification |
| Fails only after a while in production | Server clock drift (timestamp tolerance) |
| Fails right after rotating | `CODAT_WEBHOOK_SECRET` still holds the old value |
| Missing headers | A proxy stripped `webhook-*` headers, or the request isn't from Codat |
