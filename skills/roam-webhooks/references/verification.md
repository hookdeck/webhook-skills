# How to Verify Roam Webhook Signatures

## How Does Roam Sign Webhooks?

Roam follows [Standard Webhooks](https://www.standardwebhooks.com/). Signed deliveries (a signing secret is configured) carry:

| Header | Description |
|--------|-------------|
| `webhook-id` | The event's `eventId`; identical on retries and on both bodies of one event |
| `webhook-timestamp` | Unix timestamp in seconds when sent |
| `webhook-signature` | `v1,<base64>`; several space-delimited entries may appear |

The signature is `base64(HMAC-SHA256(key, "{webhook-id}.{webhook-timestamp}.{raw body}"))`, where `key` is the **base64-decoded** part of the secret after `whsec_`.

## Implementation

### Library (recommended, as in Roam's docs)

```javascript
// npm install standardwebhooks
const { Webhook } = require('standardwebhooks');
const event = new Webhook(process.env.ROAM_WEBHOOK_SIGNING_SECRET).verify(rawBody, {
  'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature,
}); // throws on bad signature or a timestamp more than 5 minutes off
```

```python
# pip install standardwebhooks
from standardwebhooks.webhooks import Webhook
event = Webhook(secret).verify(raw_body, {"webhook-id": ..., "webhook-timestamp": ..., "webhook-signature": ...})
```

### Why does the library reject Hookdeck retries?

`standardwebhooks` and `svix` always enforce a fixed 5-minute window on `webhook-timestamp`. Hookdeck retries and replays resend the **original** timestamp, so anything retried or replayed more than 5 minutes after Roam sent it fails with "Message timestamp too old". Use the manual verifier below and drop the window (`toleranceSeconds = null`) or widen it.

### Manual (Node, window optional)

```javascript
const crypto = require('crypto');

function verifyRoamSignature(headers, rawBody, signingSecret, toleranceSeconds = null) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  if (!id || !timestamp || !headers['webhook-signature']) return false;
  if (toleranceSeconds !== null) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) return false;
  }
  const key = Buffer.from(signingSecret.slice('whsec_'.length), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8').digest('base64');
  return headers['webhook-signature'].split(' ').some((entry) => {
    const [version, sig = ''] = entry.split(',');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    return version === 'v1' && a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
```

### Manual (Python)

```python
import base64, binascii, hashlib, hmac, time

def verify_roam(headers: dict, raw_body: bytes, secret: str, tolerance_seconds: int | None = None) -> bool:
    msg_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    signature = headers.get("webhook-signature")
    if not msg_id or not timestamp or not signature:
        return False
    if tolerance_seconds is not None:
        try:
            if abs(time.time() - int(timestamp)) > tolerance_seconds:
                return False
        except ValueError:
            return False
    try:
        key = base64.b64decode(secret[len("whsec_"):], validate=True)
    except binascii.Error as exc:
        raise ValueError("ROAM_WEBHOOK_SIGNING_SECRET is not a valid whsec_ base64 secret") from exc
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest())
    for entry in signature.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig.encode(), expected):
            return True
    return False
```

A malformed secret raises `ValueError` (a configuration error) rather than silently verifying against a wrong key. Comparing bytes (`.encode()`) keeps `hmac.compare_digest` from raising on non-ASCII header values.

## Common Gotchas

- **Use the raw body.** Parse JSON only after verifying. In Express use `express.raw({ type: '*/*' })` so any content type is read raw.
- **Decode the key.** The HMAC key is the base64-decoded bytes after `whsec_`, not the secret string.
- **Multiple signatures.** Check every space-delimited `v1,` entry in constant time.
- **No secret, no signature.** Without a configured signing secret Roam sends no `webhook-timestamp` or `webhook-signature`; set one.
- **Two POSTs per event.** The legacy and v1 bodies share one `webhook-id` and are signed separately. Dedupe on `webhook-id`, process the v1 envelope.
- **Retries keep `webhook-id`.** Use it for idempotency.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Body parsed before verifying, or the secret wasn't base64-decoded |
| Missing signature headers | No signing secret configured on the Roam webhook |
| Invalid after a proxy/middleware | Middleware modified or re-encoded the body |
| "Message timestamp too old" via Hookdeck | Retry or replay after 5 minutes; use the manual verifier without the window |
