# How to Verify Notifuse Webhook Signatures

## How Does Notifuse Sign Webhooks?

Notifuse signs every outgoing webhook per the [Standard Webhooks](https://www.standardwebhooks.com/) specification with HMAC-SHA256. Each request carries three headers:

| Header | Value |
|--------|-------|
| `webhook-id` | Unique ID of the delivery |
| `webhook-timestamp` | Unix timestamp (seconds) of the attempt |
| `webhook-signature` | Space-separated list of `v1,<base64 signature>` entries |

The signature is computed as:

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The request is valid when any `v1,` entry matches. Each webhook subscription has its own secret, generated when the subscription is created (`whsec_<base64 of 32 random bytes>`). Only the workspace owner can see it, and `webhookSubscriptions.regenerateSecret` rotates it. The old secret stops working at once.

## Why Does Signature Verification Matter?

Your endpoint URL is public. Without verification, anyone can POST a fake `contact.deleted` or `email.unsubscribed` event and make your system act on it.

## Implementation

### Library Verification (recommended)

Use [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) (npm, PyPI). It strips `whsec_`, decodes the key, checks the timestamp, compares in constant time against every `v1,` entry, and returns the parsed payload.

```javascript
const { Webhook } = require('standardwebhooks');

// rawBody: the exact request body string, NOT re-serialised JSON
const event = new Webhook(process.env.NOTIFUSE_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws on a bad signature or a timestamp more than 5 minutes off
```

```python
from standardwebhooks.webhooks import Webhook

prefix = "webhook" if request.headers.get("webhook-id") else "svix"
headers = {
    "webhook-id": request.headers.get(f"{prefix}-id"),
    "webhook-timestamp": request.headers.get(f"{prefix}-timestamp"),
    "webhook-signature": request.headers.get(f"{prefix}-signature"),
}
if not all(headers.values()):
    raise HTTPException(status_code=400, detail="Missing signature headers")
# raises WebhookVerificationError on a bad signature or a timestamp more than 5 minutes off
event = Webhook(os.environ["NOTIFUSE_WEBHOOK_SECRET"]).verify(await request.body(), headers)
```

### Header fallback: webhook-* or svix-*

Notifuse sends `webhook-*` headers. A Svix-style sender uses `svix-id`, `svix-timestamp` and `svix-signature` for the same values, and Hookdeck reads either set. The examples read `webhook-id` first and, when it is absent, use the `svix-*` headers, then hand the library the three values under the `webhook-*` names it expects:

```javascript
const prefix = req.get('webhook-id') ? 'webhook' : 'svix';
const headers = {
  'webhook-id': req.get(`${prefix}-id`),
  'webhook-timestamp': req.get(`${prefix}-timestamp`),
  'webhook-signature': req.get(`${prefix}-signature`),
};
```

### Manual Verification (no dependency, adjustable timestamp window)

The library always enforces a fixed 5-minute window. **Hookdeck retries and replays resend the original timestamp**, so a retry that arrives more than 5 minutes later fails the library check. Use this verifier when your endpoint sits behind Hookdeck (or anything that replays) and you want to drop or widen the window. It tries every `v1,` entry, compares in constant time after a length check, ignores other versions such as `v1a`, and requires the timestamp to be a plain positive integer. A secret without the `whsec_` prefix is used as its raw UTF-8 bytes.

```javascript
const crypto = require('crypto');

// toleranceSeconds: null skips the window; a number enforces it
function verifyNotifuse(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = null) {
  if (!id || !signatureHeader || !/^[0-9]+$/.test(timestamp || '') || Number(timestamp) <= 0) return false;
  if (toleranceSeconds !== null && Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;

  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');
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
from typing import Optional

def verify_notifuse(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
                    secret: str, tolerance_seconds: Optional[int] = None) -> bool:
    if not msg_id or not signature_header or not (timestamp.isascii() and timestamp.isdigit()) or int(timestamp) <= 0:
        return False
    if tolerance_seconds is not None and abs(time.time() - int(timestamp)) > tolerance_seconds:
        return False

    key = base64.b64decode(secret[len("whsec_"):]) if secret.startswith("whsec_") else secret.encode()
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = hmac.new(key, signed, hashlib.sha256).digest()

    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version != "v1" or not sig:
            continue
        try:
            received = base64.b64decode(sig, validate=True)
        except ValueError:
            continue
        if len(received) == len(expected) and hmac.compare_digest(received, expected):
            return True
    return False
```

## Common Gotchas

- **Raw body.** The HMAC covers the exact bytes Notifuse sent. Use `express.raw({ type: '*/*' })`, `await request.text()` or `await request.body()`. Parsing and re-serialising JSON changes whitespace and key order. Reading raw bytes with `type: '*/*'` also makes any content type work.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string.
- **Keep the full value in the env var.** `NOTIFUSE_WEBHOOK_SECRET` holds the whole `whsec_...` string.
- **One secret per subscription.** A secret from another subscription (or workspace) won't verify.
- **Rotation.** `webhookSubscriptions.regenerateSecret` invalidates the old secret immediately, so deliveries fail until you deploy the new one. Deleting and recreating a subscription also issues a new secret.
- **Multiple signatures.** `webhook-signature` can hold several space-separated entries. Accept the request if any `v1,` entry matches.
- **Timestamp window.** The library rejects timestamps more than 5 minutes from your server clock. Keep the clock in sync with NTP. Behind Hookdeck, retries and replays keep the original timestamp, so use the manual verifier above with the window dropped or widened.
- **Dedupe on `webhook-id`.** Notifuse's docs say webhooks may rarely be delivered more than once and recommend `webhook-id` for idempotency.

## How Do I Debug Notifuse Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong subscription's secret, `whsec_` prefix not stripped or key not base64-decoded, or the body was parsed before verification |
| Fails right after rotating | `NOTIFUSE_WEBHOOK_SECRET` still holds the old value |
| Fails only on retries behind Hookdeck | The 5-minute library window. Retries resend the original timestamp |
| Fails only after a while in production | Server clock drift |
| Missing headers | A proxy stripped the `webhook-*` headers, or the request isn't from Notifuse |

Check the delivery history (`webhookSubscriptions.deliveries`, or the subscription in the console) for the response status and body your endpoint returned, and fire a sample with `webhookSubscriptions.test`.
