# How to Verify Emporix Webhook Signatures

## How Does Emporix Sign Webhooks?

Emporix delivers through Svix (Svix-Shared or your own licensed Svix account). Each request includes:

| Header | Contents |
|--------|----------|
| `svix-id` | Unique message ID (stable across retries; use it to deduplicate) |
| `svix-timestamp` | Attempt time, Unix seconds |
| `svix-signature` | Space-delimited list of `v1,<base64 signature>` entries |

1. Build the signed content: `{svix-id}.{svix-timestamp}.{raw body}`.
2. Strip `whsec_` from the endpoint signing secret and base64-decode the rest to get the key. The secret
   comes from the Svix dashboard; Emporix's pages never show it.
3. Compute HMAC-SHA256 of the signed content and base64-encode it.
4. Compare in constant time against every `v1,` entry. Any match passes (several entries during rotation).

Not covered: the **Other - HTTP** strategy (`emporix-event-signature`, base64 HMAC over alphabetically
re-sorted JSON). Hookdeck's Emporix source only supports the Svix strategies.

## SDK Verification (recommended)

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only
new Webhook(process.env.EMPORIX_WEBHOOK_SECRET).verify(rawBody, {
  'svix-id': req.headers['svix-id'],
  'svix-timestamp': req.headers['svix-timestamp'],
  'svix-signature': req.headers['svix-signature'],
});
```

```python
from svix.webhooks import Webhook, WebhookVerificationError
Webhook(os.environ["EMPORIX_WEBHOOK_SECRET"]).verify(raw_body, {
    "svix-id": svix_id, "svix-timestamp": svix_timestamp, "svix-signature": svix_signature})
```

The `standardwebhooks` library gives the same result if you map `svix-id`, `svix-timestamp`,
`svix-signature` to `webhook-id`, `webhook-timestamp`, `webhook-signature`.

## Why Do Retries and Replays Fail After 5 Minutes?

`svix` and `standardwebhooks` always reject a `svix-timestamp` more than 5 minutes from now, and the window
isn't configurable. Hookdeck retries and replays resend the **original** headers, including the original
timestamp, so a retry that arrives later than 5 minutes after the first delivery fails with a timestamp
error even though the signature is valid. The same applies when you replay an event from the Svix dashboard
through a slow queue. Use the manual verifier below and drop the window (replay protection then comes from
deduplicating on `svix-id`) or widen it.

## Manual Verification (configurable timestamp window)

```javascript
import crypto from 'node:crypto';

// toleranceSeconds: null skips the timestamp check; otherwise the allowed drift
function verifyEmporix(rawBody, svixId, svixTimestamp, svixSignature, secret, toleranceSeconds = null) {
  if (toleranceSeconds !== null) {
    const now = Math.floor(Date.now() / 1000);
    if (!/^\d+$/.test(svixTimestamp) || Math.abs(now - Number(svixTimestamp)) > toleranceSeconds) return false;
  }
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${svixId}.${svixTimestamp}.${rawBody}`)
    .digest('base64');

  return svixSignature.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
```

```python
import base64, hashlib, hmac, time
from typing import Optional

def verify_emporix(raw_body: bytes, svix_id: str, svix_timestamp: str, svix_signature: str,
                   secret: str, tolerance_seconds: Optional[int] = None) -> bool:
    if tolerance_seconds is not None:
        if not svix_timestamp.isdigit() or abs(int(time.time()) - int(svix_timestamp)) > tolerance_seconds:
            return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{svix_id}.{svix_timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    for entry in svix_signature.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig.encode(), expected.encode()):
            return True
    return False
```

Pass the raw body bytes (`req.body` from `express.raw({ type: '*/*' })`, `await request.text()`, or
`await request.body()`).

## Common Gotchas

- **Raw body only.** Re-serialized JSON changes whitespace and key order. In Express use
  `express.raw({ type: '*/*' })` so any content type is read as bytes.
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not the literal string.
- **Multiple signatures.** Split `svix-signature` on spaces and accept any matching `v1,` entry.
- **One secret per endpoint.** A secret from another Svix endpoint won't verify.
- **Deduplicate on `svix-id`.** Retries reuse it.
- **No event type in the headers or documented body.** See the examples' `eventType` handling.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "Invalid signature" | Wrong secret (or from another endpoint), or body parsed/re-serialized first |
| Works, then fails on retries or replays | The 5-minute timestamp window; use the manual verifier |
| "Timestamp too old" on fresh events | Server clock drift |
| Missing headers | A proxy or middleware dropped the `svix-*` headers |
| `emporix-event-signature` header present | You're on the Other - HTTP strategy, which isn't covered |
