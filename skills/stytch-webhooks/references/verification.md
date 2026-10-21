# Stytch Webhook Signature Verification

## How Does Verification Work?

Stytch delivers webhooks through Svix. Every request includes:

| Header | Meaning |
|--------|---------|
| `svix-id` | Unique message ID; the same on retries |
| `svix-timestamp` | Seconds since epoch |
| `svix-signature` | Space-delimited list of `v1,<base64>` signatures |

1. Build the signed content: `{svix-id}.{svix-timestamp}.{raw body}`.
2. Base64-decode the part of the `whsec_` secret after the prefix and use it as the HMAC key.
3. Compute HMAC-SHA256 and base64-encode it.
4. Strip the `v1,` prefix from each entry in `svix-signature` and compare with a constant-time function. Any match is valid.
5. Check `svix-timestamp` is within your tolerance (the Svix SDKs use 5 minutes).

## SDK Verification (Node.js, Python)

```javascript
import { Webhook } from 'svix';
new Webhook(secret).verify(rawBody, { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sig });
```

```python
from svix.webhooks import Webhook
Webhook(secret).verify(raw_body, {"svix-id": id, "svix-timestamp": ts, "svix-signature": sig})
```

## Manual Verification

```javascript
const crypto = require('crypto');
const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
const valid = svixSignature.split(' ').some((entry) => {
  const [version, sig] = entry.split(',');
  if (version !== 'v1') return false;
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); } catch { return false; }
});
```

Svix's published test vector: secret `whsec_plJ3nmyCDGBKInavdOK15jsl`, payload `{"event_type":"ping","data":{"success":true}}`, id `msg_loFOjxBNrRLzqYUf`, timestamp `1731705121` produces `v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=` (the timestamp is old, so SDK verification rejects it).

## Common Gotchas

- **Raw body**: use `express.raw({ type: '*/*' })`, `request.text()` in Next.js, and `await request.body()` in FastAPI.
- **Secret decoding**: the key is the base64-*decoded* bytes after `whsec_`, not the literal string.
- **Multiple signatures**: during secret rotation the header holds several; accept any `v1` match.
- **Timestamp**: the SDKs reject timestamps more than 5 minutes off. Check your server clock if every delivery fails with a timestamp error.
- **Wrong secret**: each endpoint has its own `whsec_` secret; copy it from the endpoint that is sending.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `Invalid signature` on every request | Wrong endpoint secret, or body parsed/re-serialized before verifying |
| `Timestamp too old` | Server clock drift, or replaying an old delivery |
| `Missing required webhook headers` | Request did not come from Stytch/Svix, or a proxy stripped the headers |
