# How to Verify Crusoe Cloud Webhook Signatures

> **Source note:** Crusoe documents that webhooks are delivered through Svix but
> publishes no signature details. Everything below is the **Svix default scheme**,
> inferred from Svix's docs, not quoted from Crusoe. If a delivery doesn't carry
> `svix-*` headers, inspect it (e.g. in the Hookdeck CLI web UI) before trusting it.

## Why Signature Verification Matters

Your endpoint is a public URL. Verification proves the request came from Crusoe's
Svix account and that the body wasn't altered or replayed. This matters here because
notifications can drive automation (paging, scaling, pausing workloads).

## How It Works

Headers on each request:

| Header | Content |
|--------|---------|
| `svix-id` | Unique message ID, stable across retries (use as idempotency key) |
| `svix-timestamp` | Unix timestamp in seconds |
| `svix-signature` | One or more space-separated `v1,<base64 signature>` entries |

```
signedContent = `${svix-id}.${svix-timestamp}.${rawBody}`
key           = base64Decode(secret without the "whsec_" prefix)
signature     = base64(HMAC_SHA256(key, signedContent))
```

## Implementation

### SDK Verification (Node and Python)

The official `svix` SDK exists for both languages, so all three examples use it.

```javascript
import { Webhook } from 'svix'; // svix 2.8+ is ESM-only

new Webhook(process.env.CRUSOE_WEBHOOK_SECRET).verify(rawBody, {
  'svix-id': req.headers['svix-id'],
  'svix-timestamp': req.headers['svix-timestamp'],
  'svix-signature': req.headers['svix-signature'],
}); // throws WebhookVerificationError
```

```python
from svix.webhooks import Webhook, WebhookVerificationError

Webhook(os.environ["CRUSOE_WEBHOOK_SECRET"]).verify(raw_body, {
    "svix-id": headers["svix-id"],
    "svix-timestamp": headers["svix-timestamp"],
    "svix-signature": headers["svix-signature"],
})  # raises WebhookVerificationError
```

In svix 2.x `verify()` returns nothing; parse the raw body yourself after it passes.
The 2.x Node package is ESM-only and needs Node 22.12+ (Jest needs Node 24.9+ to
`require()` it).

### Manual Verification (no SDK)

```javascript
const crypto = require('crypto');

function verifyCrusoe(rawBody, id, timestamp, signatureHeader, secret) {
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`).digest();
  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const received = Buffer.from(sig, 'base64');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}
```

## Common Gotchas

- **Raw body only.** Verify the exact received bytes. `express.json()`, re-serializing, or reading `await request.json()` first breaks the signature. Use `express.raw()`, `await request.text()` or `await request.body()`.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string.
- **Multiple signatures.** During rotation `svix-signature` holds several entries; accept if any matches.
- **Timestamp window.** The SDK rejects timestamps more than 5 minutes from your clock. Keep server clocks in sync (NTP).
- **No event type header.** Svix doesn't send the event type in a header and Crusoe's documented payload has no `type` field; see [overview.md](overview.md).

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `No matching signature found` | Body parsed or modified before verification, or wrong endpoint's secret |
| `Message timestamp too old` / `too new` | Server clock drift, or replaying an old captured request |
| `Missing required headers` | Request didn't come through Svix, or a proxy stripped `svix-*` headers |
| Secret config error | `CRUSOE_WEBHOOK_SECRET` unset or missing the `whsec_` prefix |
