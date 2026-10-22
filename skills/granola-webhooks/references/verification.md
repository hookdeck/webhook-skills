# How to Verify Granola Webhook Signatures

## How Does Granola Sign Webhooks?

Granola follows the [Standard Webhooks](https://www.standardwebhooks.com/) specification natively (not through Svix). Each delivery has:

| Header | Description |
|--------|-------------|
| `webhook-id` | The event ID (matches `event_id` in the payload) |
| `webhook-timestamp` | Unix timestamp in seconds of this delivery attempt |
| `webhook-signature` | `v1,<base64>`; several space-delimited entries may appear (e.g. during secret rotation) |

The signature is `base64(HMAC-SHA256(key, "{webhook-id}.{webhook-timestamp}.{raw body}"))`, where `key` is the **base64-decoded** part of the signing secret after the `whsec_` prefix.

## Implementation

### Library (recommended)

```javascript
// npm install standardwebhooks
const { Webhook } = require('standardwebhooks');
const event = new Webhook(process.env.GRANOLA_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature,
}); // throws on bad signature or a timestamp more than 5 minutes off
```

```python
# pip install standardwebhooks
from standardwebhooks.webhooks import Webhook
event = Webhook(secret).verify(raw_body, {"webhook-id": ..., "webhook-timestamp": ..., "webhook-signature": ...})
```

The library takes the full `whsec_...` secret and returns the parsed payload.

### Manual (Node, from Granola's docs plus a timestamp check)

```javascript
const crypto = require('crypto');

function verifyGranolaSignature(headers, rawBody, signingSecret) {
  const timestamp = Number(headers['webhook-timestamp']);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const key = Buffer.from(signingSecret.slice('whsec_'.length), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${headers['webhook-id']}.${headers['webhook-timestamp']}.${rawBody}`, 'utf8')
    .digest('base64');
  return (headers['webhook-signature'] ?? '').split(' ').some((entry) => {
    const [version, sig = ''] = entry.split(',');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    return version === 'v1' && a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
```

### Manual (Python)

```python
import base64, hashlib, hmac, time

def verify_granola(headers: dict, raw_body: bytes, secret: str) -> bool:
    if abs(time.time() - int(headers["webhook-timestamp"])) > 300:
        return False
    key = base64.b64decode(secret[len("whsec_"):])
    signed = f'{headers["webhook-id"]}.{headers["webhook-timestamp"]}.'.encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    for entry in headers["webhook-signature"].split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig, expected):
            return True
    return False
```

## Common Gotchas

- **Use the raw body.** Parse JSON only after verifying; re-serialized JSON changes the bytes. In Express use `express.raw({ type: '*/*' })` so any content type is read raw.
- **Decode the key.** The HMAC key is the base64-decoded bytes after `whsec_`, not the secret string itself.
- **Multiple signatures.** Check every space-delimited `v1,` entry; any match is valid.
- **Replay protection.** Reject timestamps more than a few minutes old (Granola's recommendation); the library does this with a 5-minute tolerance.
- **Retries keep the same `webhook-id` / `event_id`.** Use it for idempotency. The timestamp is for the delivery attempt, so it changes on retries.
- **The secret is shown once.** If lost, create a new endpoint.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Body parsed before verifying, or the secret wasn't base64-decoded |
| Invalid after a proxy/middleware | Middleware modified or re-encoded the body |
| "Message timestamp too old" | Clock skew on your server, or a delayed retry attempt being replayed manually |
| Endpoint disabled | Four days of failures; fix the receiver and re-enable it in Settings → Connectors → Webhooks |
