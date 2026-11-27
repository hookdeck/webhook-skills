# How to Verify Ordinal Webhook Signatures

## How Does Ordinal Sign Webhooks?

Ordinal's docs say "Every delivery is signed", using the
[Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks) scheme. Each
delivery carries:

| Header | Value |
|--------|-------|
| `webhook-id` | Stable id for the event. The same id is sent again on a retry |
| `webhook-timestamp` | Unix timestamp, in seconds, for when the delivery was signed |
| `webhook-signature` | One or more space-separated `v1,<base64>` signatures |
| `webhook-topic` | The event type, matching `type` in the body. **Not covered by the signature** |

```
key       = base64_decode(signing secret without the "whsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

During a secret rotation the header can carry two signatures. The request is valid when
any `v1,` entry matches.

Source: [Ordinal webhooks, Verify deliveries](https://docs.tryordinal.com/integrations/webhooks/introduction#verify-deliveries).

## Where Is the Signing Secret?

- The `signingSecret` field in the response to `POST /api/v1/webhooks`.
- The webhook's configure page under **Settings > Integrations > Webhooks**.
- `GET /webhooks` and `GET /webhooks/{id}` don't return it.

Each webhook has its own secret. Ordinal's docs don't say how to start a rotation.

## Implementation

### Library Verification (recommended)

Ordinal's docs point to the Standard Webhooks libraries (`npm install standardwebhooks`,
`pip install standardwebhooks`). `verify` returns the parsed body and throws when the
signature doesn't match or when `webhook-timestamp` is more than five minutes from the
current time.

```javascript
const { Webhook } = require('standardwebhooks');

const event = new Webhook(process.env.ORDINAL_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
});
```

```python
from standardwebhooks.webhooks import Webhook

event = Webhook(os.environ["ORDINAL_WEBHOOK_SECRET"]).verify(
    await request.body(),
    {
        "webhook-id": request.headers["webhook-id"],
        "webhook-timestamp": request.headers["webhook-timestamp"],
        "webhook-signature": request.headers["webhook-signature"],
    },
)
```

### Manual Verification

Use this when you can't add the library, or when you want your own timestamp window (for
example, to accept a delivery replayed from a queue some time after it was signed).

```javascript
const crypto = require('crypto');

function verifyOrdinal(rawBody, id, timestamp, signatureHeader, secret) {
  if (!/^\d+$/.test(timestamp)) return false;
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
import base64, hashlib, hmac

def verify_ordinal(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str, secret: str) -> bool:
    if not timestamp.isdigit():
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version != "v1" or not sig:
            continue
        try:
            received = base64.b64decode(sig)
        except ValueError:
            continue
        if len(received) == len(expected) and hmac.compare_digest(received, expected):
            return True
    return False
```

## Custom Headers (optional, separate from signing)

A webhook can also carry static custom headers through its `headers` field ("Optional
custom headers to include in webhook requests"), which Ordinal adds to every delivery.
They aren't a signature: the value is the same on every request and covers nothing in
the body. Use them only as an extra check, compared in constant time, alongside the
signature.

## Common Gotchas

- **Raw body.** The HMAC covers the exact bytes Ordinal sent. Use
  `express.raw({ type: '*/*' })`, `await request.text()` or `await request.body()`, and
  parse JSON only after verification.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the
  literal string.
- **Several signatures.** `webhook-signature` can hold two entries during a rotation.
  Accept the request if any `v1,` entry matches.
- **Timestamp window.** The library rejects a `webhook-timestamp` more than five minutes
  from now, so check the server clock.
- **`webhook-topic` is unsigned.** Route on `type` from the verified body.
- **Secret shown once over the API.** Save `signingSecret` from the create response, or
  copy it from the dashboard.
- **Deduplicate on `webhook-id`.** The body has no event id; the header is stable across
  retries.

## How Do I Debug Ordinal Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Another webhook's secret, `whsec_` not stripped or key not base64-decoded, or the body was parsed before verification |
| Fails only for older or replayed deliveries | `webhook-timestamp` more than five minutes off: use the manual verifier with your own window |
| Fails after a secret rotation | `ORDINAL_WEBHOOK_SECRET` still holds the old secret |
| No `webhook-*` headers at all | The request didn't come from Ordinal |
