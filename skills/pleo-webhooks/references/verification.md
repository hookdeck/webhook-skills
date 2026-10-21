# How to Verify Pleo Webhook Signatures

## How Pleo Signature Verification Works

Pleo delivers webhooks through [Svix](https://www.svix.com), so each request carries the [Standard Webhooks](https://www.standardwebhooks.com/) headers:

| Header | Description |
|--------|-------------|
| `webhook-id` | Unique message ID. The same value is sent when a message is retried |
| `webhook-timestamp` | Unix time (seconds) when the message was sent |
| `webhook-signature` | Space-delimited list of signatures, each `v1,<base64>` |

Pleo's docs say to verify "the webhook signature and the timestamp" but don't spell out the algorithm. The scheme below is **inferred from Svix delivery**, which signs every message the same way:

- **Algorithm:** HMAC-SHA256, base64-encoded
- **Signed content:** `{webhook-id}.{webhook-timestamp}.{raw request body}`
- **Key:** the subscription secret (`whsec_...`) with the `whsec_` prefix removed, then **base64-decoded**
- **Comparison:** constant-time, against each `v1,` entry in `webhook-signature` (several can be present, for example during key rotation)
- **Timestamp:** reject messages whose timestamp is more than ~5 minutes from now

## SDK Verification (recommended)

Pleo has no webhook SDK. Use the Standard Webhooks library (or Svix's), which implements the scheme above, including the timestamp check.

**Node.js** (`npm install standardwebhooks`):

```javascript
const { Webhook } = require('standardwebhooks');

const wh = new Webhook(process.env.PLEO_WEBHOOK_SECRET); // full "whsec_..." value
const event = wh.verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws on bad signature or stale timestamp; returns parsed JSON
```

**Python** (`pip install standardwebhooks`):

```python
from standardwebhooks.webhooks import Webhook

wh = Webhook(os.environ["PLEO_WEBHOOK_SECRET"])
event = wh.verify(raw_body, {
    "webhook-id": request.headers["webhook-id"],
    "webhook-timestamp": request.headers["webhook-timestamp"],
    "webhook-signature": request.headers["webhook-signature"],
})  # raises WebhookVerificationError
```

The `svix` package (`new Webhook(secret).verify(body, headers)`) works too.

## Manual Verification (fallback)

```javascript
const crypto = require('crypto');

function verifyPleo(rawBody, headers, secret, toleranceSec = 300) {
  const id = headers['webhook-id'];
  const ts = headers['webhook-timestamp'];
  const sigHeader = headers['webhook-signature'];
  if (!id || !ts || !sigHeader) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSec) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${ts}.${rawBody}`).digest();

  return sigHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const received = Buffer.from(sig, 'base64');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}
```

```python
import base64, hashlib, hmac, time

def verify_pleo(raw_body: bytes, headers, secret: str, tolerance: int = 300) -> bool:
    msg_id = headers.get("webhook-id")
    ts = headers.get("webhook-timestamp")
    sig_header = headers.get("webhook-signature")
    if not (msg_id and ts and sig_header):
        return False
    if abs(time.time() - int(ts)) > tolerance:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{ts}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    return any(
        entry.startswith("v1,") and hmac.compare_digest(entry[3:], expected)
        for entry in sig_header.split(" ")
    )
```

## Basic Auth and Custom Header Subscriptions

If the subscription was created with `endpointAuth.type: "BASIC"` or with `customHeaders` (see [setup.md](setup.md)), compare the incoming `Authorization` or custom header against the expected value with a constant-time comparison. These checks don't cover the body or protect against replay, so use the signature when you can.

## Common Gotchas

- **Raw body.** The signature covers the exact bytes Pleo sent. `express.json()`, `request.json()` or FastAPI body models re-serialise the JSON and break verification. Use `express.raw()`, `await request.text()` or `await request.body()`.
- **Decode the secret.** The HMAC key is `base64decode(secret without "whsec_")`, not the secret string itself. The libraries do this for you; manual code often gets it wrong.
- **Several signatures.** `webhook-signature` can hold more than one `v1,` entry separated by spaces. Accept the message if any one matches.
- **Headers aren't in the body.** Pleo's docs show `webhook-id`, `webhook-timestamp` and `webhook-signature` in the same JSON block as the payload. They're HTTP headers; the body is `{ data, eventId, eventType }`.
- **One secret per subscription.** Separate subscriptions (for example, one per entity) have separate secrets. Look up the right one, or try each configured secret.
- **Clock skew.** The 5-minute timestamp window fails if your server clock drifts. Keep NTP running.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong secret (from another subscription or environment), or the key isn't base64-decoded |
| Fails only in production | A proxy or middleware is parsing or rewriting the body before your handler |
| `Message timestamp too old` | Server clock skew, or replaying an old captured request |
| Missing headers | Request isn't from Pleo, or a proxy is stripping `webhook-*` headers |

To debug, log the three headers and the raw body length, recompute the HMAC with the manual function above, and compare with the `v1,` value.
