# How to Verify Argil Webhook Signatures

## How Does Argil Sign Webhooks?

Argil follows [Standard Webhooks](https://www.standardwebhooks.com). Each delivery carries:

| Header | Value |
|--------|-------|
| `webhook-id` | Event ID, the same on every retry |
| `webhook-timestamp` | Unix timestamp (seconds) of this attempt |
| `webhook-signature` | Space-separated list of `v1,<base64 signature>` entries |

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The request is valid when any `v1,` entry matches. Ignore entries with other versions.

## Why Does Signature Verification Matter?

Your endpoint URL is public. Without verification anyone can POST a fake `VIDEO_GENERATION_SUCCESS` with a `videoUrl` of their choosing.

## Implementation

### Library Verification (recommended)

[`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) (npm, PyPI) is what Argil's docs use. It returns the parsed payload and enforces a **fixed 5-minute** timestamp window.

```javascript
const { Webhook } = require('standardwebhooks');

const payload = new Webhook(process.env.ARGIL_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws on a bad signature or a timestamp more than 5 minutes off
```

```python
from standardwebhooks.webhooks import Webhook

payload = Webhook(os.environ["ARGIL_WEBHOOK_SECRET"]).verify(
    await request.body(),
    {
        "webhook-id": request.headers["webhook-id"],
        "webhook-timestamp": request.headers["webhook-timestamp"],
        "webhook-signature": request.headers["webhook-signature"],
    },
)
```

**Header prefix fallback.** If `webhook-id` is absent, read `svix-id`, `svix-timestamp` and `svix-signature` instead and pass them to the library under the `webhook-*` names. The examples do this.

### Manual Verification (no timestamp window)

Retries and replays (for example from the Hookdeck Event Gateway) resend the **original** timestamp, so the library rejects them after 5 minutes. Use this verifier when you need to accept late retries, and apply your own window if you want one:

```javascript
const crypto = require('crypto');

function verifyArgil(rawBody, id, timestamp, signatureHeader, secret) {
  if (!/^\d+$/.test(timestamp)) return false; // plain positive integer
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

def verify_argil(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str, secret: str) -> bool:
    if not timestamp.isdigit():
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = hmac.new(key, signed, hashlib.sha256).digest()
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

## Common Gotchas

- **Unsigned legacy webhooks.** Webhooks created before signing shipped send no signature headers. Recreate the webhook to get a `whsec_` secret.
- **Secret shown once.** `POST /webhooks` is the only call that returns it.
- **Raw body.** The HMAC covers the exact bytes Argil sent. Use `express.raw({ type: '*/*' })`, `await request.text()` or `await request.body()`.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string.
- **Multiple signatures.** `webhook-signature` can hold several space-separated entries. Accept the request if any `v1,` entry matches.
- **Timestamp window.** The library's 5-minute check fails late retries and replays. Use the manual verifier if you need them.
- **No event ID in the body.** Dedupe on `webhook-id`.

## How Do I Debug Argil Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| No `webhook-*` or `svix-*` headers at all | Webhook predates signing: recreate it |
| Every request fails | Wrong webhook's secret, `whsec_` not stripped or key not base64-decoded, or the body was parsed before verification |
| Fails only on retries or replays | Timestamp older than 5 minutes: use the manual verifier |
| Fails after recreating the webhook | `ARGIL_WEBHOOK_SECRET` still holds the old webhook's secret |
