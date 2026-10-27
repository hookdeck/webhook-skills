# How to Verify General Translation Webhook Signatures

## How Does General Translation Sign Webhooks?

General Translation follows [Standard Webhooks](https://www.standardwebhooks.com/). Every request carries three headers:

| Header | Value |
|--------|-------|
| `webhook-id` | Event ID (`evt_...`), the same on every retry and equal to `id` in the body |
| `webhook-timestamp` | Unix timestamp in seconds when the request was sent |
| `webhook-signature` | Space-separated list of `v1,<base64 signature>` entries |

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The request is valid when any `v1` entry matches. General Translation's docs also say to check that the timestamp is within 5 minutes of the current time.

## Why Does Signature Verification Matter?

Your endpoint URL is public. Without verification, anyone can POST a fake `translated_file.completed` event and make your app fetch or publish the wrong content.

## Implementation

### Library Verification (recommended)

Use [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) (npm, [PyPI](https://pypi.org/project/standardwebhooks/)). It reads `webhook-id`, `webhook-timestamp` and `webhook-signature`, and returns the parsed body.

```javascript
const { Webhook } = require('standardwebhooks');

// rawBody: the exact request body string, NOT re-serialised JSON
const event = new Webhook(process.env.GENERAL_TRANSLATION_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws on a bad signature or a timestamp more than 5 minutes off
```

```python
from standardwebhooks.webhooks import Webhook

event = Webhook(os.environ["GENERAL_TRANSLATION_WEBHOOK_SECRET"]).verify(
    await request.body(),
    {
        "webhook-id": request.headers["webhook-id"],
        "webhook-timestamp": request.headers["webhook-timestamp"],
        "webhook-signature": request.headers["webhook-signature"],
    },
)
```

### Header Fallback (`webhook-*` or `svix-*`)

General Translation sends `webhook-*` headers. Hookdeck's General Translation source also reads the `svix-*` names (`svix-id`, `svix-timestamp`, `svix-signature`) when `webhook-id` is absent, so the examples do the same. The libraries only read `webhook-*` names, so pass the resolved values under those names:

```javascript
const p = req.get('webhook-id') ? 'webhook' : 'svix';
const headers = {
  'webhook-id': req.get(`${p}-id`),
  'webhook-timestamp': req.get(`${p}-timestamp`),
  'webhook-signature': req.get(`${p}-signature`),
};
```

The signed content is the same either way. The examples prefer `webhook-*` when both sets are present.

### Manual Verification (configurable timestamp window)

The library always enforces a fixed 5-minute window. **Hookdeck retries and replays resend the original timestamp**, so the library rejects them once they are older than 5 minutes. Use this verifier when you want to drop or widen the window. Set `MAX_AGE_SECONDS` to `null` to skip the check, or to a larger number.

```javascript
const crypto = require('crypto');

const MAX_AGE_SECONDS = 300; // null disables the window; use e.g. 86400 for replays

function verifyGeneralTranslation(rawBody, id, timestamp, signatureHeader, secret) {
  if (!/^[1-9]\d*$/.test(timestamp)) return false; // plain positive integer only
  if (MAX_AGE_SECONDS !== null && Math.abs(Date.now() / 1000 - Number(timestamp)) > MAX_AGE_SECONDS) {
    return false;
  }
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
import base64, hashlib, hmac, re, time

MAX_AGE_SECONDS = 300  # None disables the window; use e.g. 86400 for replays

def verify_general_translation(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str, secret: str) -> bool:
    if not re.fullmatch(r"[1-9]\d*", timestamp):  # plain positive integer only
        return False
    if MAX_AGE_SECONDS is not None and abs(time.time() - int(timestamp)) > MAX_AGE_SECONDS:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
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

The length check comes before the constant-time compare because `timingSafeEqual` throws on unequal lengths. Every `v1` entry is tried and other versions such as `v1a` are ignored.

## Common Gotchas

- **Raw body.** The HMAC covers the exact bytes General Translation sent. Use `express.raw({ type: '*/*' })`, `await request.text()` or `await request.body()`. Parse JSON only after verification.
- **Keep `whsec_` in the env var.** The libraries strip it and base64-decode the rest. Setting only the decoded part breaks verification.
- **One secret per endpoint.** A staging endpoint's secret won't verify production deliveries.
- **Multiple signatures.** `webhook-signature` can hold several space-separated entries. Accept the request if any `v1` entry matches.
- **Late retries.** The libraries reject timestamps more than 5 minutes from your clock. Hookdeck retries and replays resend the original timestamp, so use the manual verifier if you need to accept them.
- **Dedupe on `id`.** It equals `webhook-id` and is stable across retries.
- **Fail closed.** If the secret env var is unset, return `500` and never process the body.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong endpoint's secret, `whsec_` prefix removed from the env var, or the body was parsed before verification |
| Fails only for retries or replays | The timestamp is older than 5 minutes. Use the manual verifier with a wider window |
| Fails only after a while in production | Server clock drift |
| `400` for missing headers | A proxy stripped the `webhook-*` headers, or the request isn't from General Translation |

Check the delivery in **Organization > Developer > Webhook Events**: the **Error** field of a failed attempt shows your endpoint's status and a response excerpt. Retry it after fixing the handler.
