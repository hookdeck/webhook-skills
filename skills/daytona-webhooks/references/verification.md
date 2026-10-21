# Daytona Signature Verification

## How Are Daytona Webhooks Signed?

Daytona's [webhooks page](https://www.daytona.io/docs/en/webhooks) documents events and payloads only; it has no signature section. Daytona's source shows deliveries are sent through Svix and that the Dashboard reads the Svix endpoint secret, so the scheme is [Svix's manual verification](https://docs.svix.com/receiving/verifying-payloads/how-manual). This is inferred rather than documented by Daytona, so verify against a real delivery before relying on it.

| Item | Value |
|------|-------|
| Headers | `svix-id`, `svix-timestamp`, `svix-signature` |
| Algorithm | HMAC-SHA256, base64 |
| Signed content | `{svix-id}.{svix-timestamp}.{raw body}` |
| Key | base64-**decode** the part of the secret after `whsec_` |
| `svix-signature` | Space-delimited list like `v1,<sig> v1,<sig2>`; match any `v1` entry |
| Timestamp | Seconds since epoch; reject outside your tolerance (the SDK uses 5 minutes) |

This is not Standard Webhooks (`webhook-*` headers). The Svix libraries accept both header prefixes.

## SDK Verification (recommended)

```javascript
import { Webhook } from 'svix';
new Webhook(process.env.DAYTONA_WEBHOOK_SECRET).verify(rawBody, {
  'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sig,
}); // throws on failure; svix 2.x returns nothing, so JSON.parse(rawBody) yourself
```

```python
from svix.webhooks import Webhook, WebhookVerificationError
Webhook(secret).verify(raw_body, {"svix-id": ..., "svix-timestamp": ..., "svix-signature": ...})
event = json.loads(raw_body)
```

## Manual Verification (no SDK)

```javascript
import crypto from 'node:crypto';

function verifyManually(rawBody, id, timestamp, signatureHeader, secret, toleranceSec = 300) {
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSec) return false;
  const key = Buffer.from(secret.split('_')[1], 'base64'); // decode, don't use the string as-is
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  return signatureHeader.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false; // different lengths
    }
  });
}
```

Svix's published test vector: secret `whsec_plJ3nmyCDGBKInavdOK15jsl`, payload `{"event_type":"ping","data":{"success":true}}`, id `msg_loFOjxBNrRLzqYUf`, timestamp `1731705121` gives `v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=` (it will fail the timestamp check today).

## Common Gotchas

- **Use the raw body.** Re-serialising parsed JSON changes bytes and breaks the HMAC. Use `express.raw({ type: '*/*' })`, `await request.text()` in Next.js, `await request.body()` in FastAPI.
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not the `whsec_...` string.
- **Several signatures.** The header may hold multiple `v1,` entries (key rotation). Accept if any matches.
- **svix 2.x `verify()` returns nothing.** Parse the JSON yourself after it passes. Older examples use `const msg = wh.verify(...)`.
- **svix 2.x is ESM-only on npm.** Express examples need `"type": "module"`.
- **No event ID in the payload.** Dedupe on `svix-id`.
- **Fail closed.** If `DAYTONA_WEBHOOK_SECRET` is unset, return 500 rather than skipping verification.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Missing `svix-*` headers | Request isn't from Daytona/Svix, or a proxy stripped headers |
| Signature always mismatches | Body parsed before verifying; secret not decoded; wrong endpoint's secret (each endpoint has its own) |
| "Message timestamp too old" | Server clock skew, or a replayed request |
| Works for some events only | Different endpoints (and secrets) per subscription |
