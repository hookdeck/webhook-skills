# How to Verify Footprint Webhook Signatures

## How Does Footprint Sign Webhooks?

Footprint's webhooks are delivered by Svix, and Footprint's docs point to Svix's verification
guide. Each request includes:

| Header | Contents |
|--------|----------|
| `svix-id` | Unique message ID (stable across retries; your idempotency key) |
| `svix-timestamp` | Attempt time, Unix seconds |
| `svix-signature` | Space-delimited list of `v1,<base64 signature>` entries |

Svix implements Standard Webhooks; `webhook-id`, `webhook-timestamp`, and `webhook-signature`
carry the same values and the Svix libraries accept either set of names.

The algorithm:

1. Build the signed content: `{svix-id}.{svix-timestamp}.{raw body}`.
2. Strip the `whsec_` prefix from the signing secret and base64-decode the rest.
3. Compute HMAC-SHA256 of the signed content with the decoded key.
4. Base64-encode the digest.
5. Compare it (constant time) against each `v1,` entry in `svix-signature`. Any match
   passes. Several entries appear during secret rotation.
6. Optionally reject timestamps too far from now (the libraries use a fixed 5 minutes).

The `whsec_` secret format is Svix's. Footprint's pages never show the secret, so the format is
unconfirmed on Footprint's own docs.

## SDK Verification (recommended)

### Node.js

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only

const wh = new Webhook(process.env.FOOTPRINT_WEBHOOK_SECRET);
wh.verify(rawBody, {
  'svix-id': req.headers['svix-id'],
  'svix-timestamp': req.headers['svix-timestamp'],
  'svix-signature': req.headers['svix-signature'],
});
// svix 2.x verify() returns undefined; parse rawBody yourself afterwards.
```

With Express, read the body with `express.raw({ type: '*/*' })` so any content type reaches
the verifier as a Buffer.

### Python

```python
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["FOOTPRINT_WEBHOOK_SECRET"])
try:
    wh.verify(raw_body, {
        "svix-id": headers["svix-id"],
        "svix-timestamp": headers["svix-timestamp"],
        "svix-signature": headers["svix-signature"],
    })
except WebhookVerificationError:
    ...  # return 400
```

## Why Do Hookdeck Retries and Replays Fail the SDK Check?

The `svix` and `standardwebhooks` libraries always enforce a fixed 5-minute timestamp window
and expose no option to change it. Hookdeck retries and replays resend the original request,
including the original `svix-timestamp`. A retry or replay more than 5 minutes after the first
delivery is rejected as "Message timestamp too old", even though the signature is valid.

If your handler sits behind Hookdeck, or you replay events for debugging, use the manual
verifier below, which drops the window (`toleranceSeconds = null`) or widens it. Replay
protection then comes from deduplicating on `svix-id`.

## Manual Verification (configurable timestamp window)

```javascript
import crypto from 'node:crypto';

// toleranceSeconds: null disables the timestamp check; 300 matches the SDK; larger widens it
function verifyFootprint(rawBody, svixId, svixTimestamp, svixSignature, secret, toleranceSeconds = null) {
  if (toleranceSeconds !== null) {
    const now = Math.floor(Date.now() / 1000);
    if (!(Math.abs(now - Number(svixTimestamp)) <= toleranceSeconds)) return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${svixId}.${svixTimestamp}.`)
    .update(rawBody) // Buffer or string, exactly as received
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

def verify_footprint(raw_body: bytes, svix_id: str, svix_timestamp: str, svix_signature: str,
                     secret: str, tolerance_seconds: Optional[int] = None) -> bool:
    # tolerance_seconds=None disables the timestamp check; 300 matches the SDK
    if tolerance_seconds is not None:
        try:
            if abs(int(time.time()) - int(svix_timestamp)) > tolerance_seconds:
                return False
        except ValueError:
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

## Common Gotchas

- **Raw body only.** Parsing JSON and re-serializing changes whitespace and key order.
  Use `express.raw({ type: '*/*' })`, `await request.text()` (Next.js), or
  `await request.body()` (FastAPI).
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not
  the literal string.
- **Multiple signatures.** Split `svix-signature` on spaces and accept any matching
  `v1,` entry. Don't compare the whole header.
- **Fixed 5-minute window in the SDKs.** See the Hookdeck section above.
- **One secret per endpoint.** A secret from a different endpoint won't verify.
- **CSRF middleware** must be disabled on the webhook route.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "Invalid signature" | Wrong secret, or body was parsed/re-serialized before verification |
| Fails only after deploys or proxies | A proxy or middleware rewrote the body or stripped headers |
| "Timestamp too old" on retries or replays | The SDK's fixed 5-minute window; use the manual verifier |
| "Timestamp too old" on first delivery | Server clock drift |
| Missing headers | Something in front of your app dropped `svix-*` headers |
