# How to Verify folk Webhook Signatures

## How Does folk Sign Webhooks?

folk uses the [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md) scheme with HMAC-SHA256 and the webhook's secret as the signing key. Every delivery has three headers:

| Header | Value |
|--------|-------|
| `webhook-id` | Unique event ID (same as the payload's `id`), stable across redeliveries |
| `webhook-timestamp` | Unix timestamp (seconds) of the delivery |
| `webhook-signature` | Space-separated list of `v1,<base64 signature>` entries |

The signature is computed as:

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The request is valid when any `v1,` entry matches. folk recommends the official Standard Webhooks libraries and says to pass the raw body: any manipulation of it makes verification fail.

## Why Does Signature Verification Matter?

Your endpoint URL is public. Without verification, anyone can POST a fake `person.deleted` or `object.updated` event.

## Implementation

### Library Verification (recommended)

Use [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) (npm, PyPI). folk sends `webhook-*` headers, so no mapping is needed. It returns the parsed payload.

```javascript
const { Webhook } = require('standardwebhooks');

// rawBody: the exact request body string, NOT re-serialised JSON
const event = new Webhook(process.env.FOLK_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws on bad signature or a timestamp more than 5 minutes off
```

```python
import os
from standardwebhooks.webhooks import Webhook

event = Webhook(os.environ["FOLK_WEBHOOK_SECRET"]).verify(
    await request.body(),
    {
        "webhook-id": request.headers["webhook-id"],
        "webhook-timestamp": request.headers["webhook-timestamp"],
        "webhook-signature": request.headers["webhook-signature"],
    },
)
```

The `svix` library works too, but its v2 `verify()` returns nothing, so parse the body yourself.

### Why Do Hookdeck Retries and Replays Fail the Library Check?

`standardwebhooks` and `svix` always enforce a **fixed 5-minute** timestamp window, and it isn't configurable. Hookdeck retries and replays resend the **original** `webhook-timestamp`, so a retry or replay that arrives more than 5 minutes after folk signed the request is rejected with a timestamp error even though the signature is valid. Use the manual verifier below to drop the window (idempotency on `webhook-id` protects against replays instead) or widen it.

### Manual Verification (window can be dropped or widened)

Pass `toleranceSeconds = null` to skip the timestamp check, or a larger number such as `86400` to widen it. Every space-separated `v1,<base64>` entry is checked in constant time.

```javascript
const crypto = require('crypto');

function verifyFolk(rawBody, webhookId, webhookTimestamp, webhookSignature, secret, toleranceSeconds = 300) {
  const ts = Number(webhookTimestamp);
  if (!Number.isFinite(ts)) return false;
  if (toleranceSeconds !== null && Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${webhookId}.${webhookTimestamp}.${rawBody}`)
    .digest();
  return webhookSignature.split(' ').some((entry) => {
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

def verify_folk(
    raw_body: bytes,
    webhook_id: str,
    webhook_timestamp: str,
    webhook_signature: str,
    secret: str,
    tolerance_seconds: Optional[int] = 300,  # None drops the window
) -> bool:
    try:
        ts = int(webhook_timestamp)
    except ValueError:
        return False
    if tolerance_seconds is not None and abs(time.time() - ts) > tolerance_seconds:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{webhook_id}.{webhook_timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    return any(
        version == "v1" and hmac.compare_digest(sig, expected)
        for version, _, sig in (entry.partition(",") for entry in webhook_signature.split(" "))
    )
```

## Common Gotchas

- **Raw body.** The HMAC covers the exact bytes folk sent. Use `express.raw({ type: '*/*' })` (any content type), `await request.text()` or `await request.body()`. Parsing and re-serialising JSON changes whitespace and key order.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string.
- **The secret is shown once.** If you lose it, create a new webhook. Each webhook has its own secret.
- **Multiple signatures.** `webhook-signature` can hold several space-separated entries. Accept the request if any `v1,` entry matches.
- **Timestamp window.** The libraries reject timestamps more than 5 minutes from your server clock. Keep the clock in sync with NTP, and use the manual verifier for retries and replays that arrive late (for example through Hookdeck).
- **Dedupe on `webhook-id`.** It equals the payload's `id` and stays the same across redeliveries.
- **Header casing.** folk's docs show `webhook-Id`. HTTP headers are case-insensitive, so lowercase lookups work in Express, Next.js and FastAPI.

## How Do I Debug folk Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong webhook's secret, `whsec_` prefix not stripped or key not base64-decoded, or the body was parsed before verification |
| Library says timestamp too old, signature is valid | Retry or replay arriving more than 5 minutes after signing. Use the manual verifier with a wider or no window |
| Fails only after a while in production | Server clock drift |
| Fails for a webhook you recreated | `FOLK_WEBHOOK_SECRET` still holds the old webhook's secret |
| Missing headers | A proxy stripped `webhook-*` headers, or the request isn't from folk |
