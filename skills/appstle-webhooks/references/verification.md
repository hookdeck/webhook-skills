# How to Verify Appstle Webhook Signatures

## How Does Appstle Sign Webhooks?

Appstle's webhooks are delivered by Svix. Each request includes:

| Header | Contents |
|--------|----------|
| `svix-id` | Unique message ID (also your idempotency key) |
| `svix-timestamp` | Attempt time, Unix seconds |
| `svix-signature` | Space-delimited list of `v1,<base64 signature>` entries |

The algorithm:

1. Build the signed content: `{svix-id}.{svix-timestamp}.{raw body}`.
2. Strip the `whsec_` prefix from the signing secret and base64-decode the rest.
3. Compute HMAC-SHA256 of the signed content with the decoded key.
4. Base64-encode the digest.
5. Compare it (constant time) against each `v1,` entry in `svix-signature`. Any match
   passes. Several entries appear during secret rotation.

The secret is in **Settings → Webhooks** in the Appstle dashboard.

## SDK Verification (recommended)

Appstle's docs use the official Svix libraries (`svix` on npm and PyPI).

### Node.js

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only

const wh = new Webhook(process.env.APPSTLE_WEBHOOK_SECRET);
wh.verify(rawBody, {
  'svix-id': req.headers['svix-id'],
  'svix-timestamp': req.headers['svix-timestamp'],
  'svix-signature': req.headers['svix-signature'],
});
// svix 2.x verify() returns undefined; parse rawBody yourself afterwards.
```

Appstle's own snippet calls `wh.verify(JSON.stringify(req.body), headers)`. That
re-serializes the parsed JSON and can differ byte-for-byte from what was signed. Verify
the raw bytes instead (`express.raw({ type: '*/*' })`).

### Python

```python
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["APPSTLE_WEBHOOK_SECRET"])
try:
    wh.verify(raw_body, {
        "svix-id": headers["svix-id"],
        "svix-timestamp": headers["svix-timestamp"],
        "svix-signature": headers["svix-signature"],
    })
except WebhookVerificationError:
    ...  # return 400
```

## Why Do Retries and Replays Fail Verification?

The `svix` and `standardwebhooks` libraries always enforce a fixed 5-minute timestamp
window (timestamps more than 5 minutes old or in the future are rejected) and expose no
option to change it.

Hookdeck retries and replays resend the **original** request, including the original
`svix-timestamp`. A retry or replay that happens more than 5 minutes after the event
carries a valid signature but a stale timestamp, so library verification rejects it
("Message timestamp too old"). Use the manual verifier below if you need to accept
them: pass `toleranceSeconds = null` to drop the window, or a larger number to widen it.
Deduplicate on `svix-id` so accepting late deliveries cannot cause double processing.

## Manual Verification (window configurable)

```javascript
import crypto from 'node:crypto';

// toleranceSeconds: null = no timestamp check, or e.g. 86400 to accept 24h-old deliveries
function verifyAppstle(rawBody, svixId, svixTimestamp, svixSignature, secret, toleranceSeconds = null) {
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

  // Check every entry: there is more than one during secret rotation
  let valid = false;
  for (const entry of svixSignature.split(' ')) {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) continue;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) valid = true;
  }
  return valid;
}
```

```python
import base64, hashlib, hmac, time
from typing import Optional

def verify_appstle(raw_body: bytes, svix_id: str, svix_timestamp: str, svix_signature: str,
                   secret: str, tolerance_seconds: Optional[int] = None) -> bool:
    if tolerance_seconds is not None:
        try:
            if abs(int(time.time()) - int(svix_timestamp)) > tolerance_seconds:
                return False
        except ValueError:
            return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{svix_id}.{svix_timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    valid = False
    for entry in svix_signature.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig.encode(), expected.encode()):
            valid = True
    return valid
```

## Common Gotchas

- **Raw body only.** Parsing JSON and re-serializing changes whitespace and key order.
  Use `express.raw({ type: '*/*' })`, `await request.text()` (Next.js), or
  `await request.body()` (FastAPI).
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not the
  literal string.
- **Multiple signatures.** Split `svix-signature` on spaces and accept any matching `v1,`
  entry. Don't compare the whole header.
- **Timestamp window.** The SDK rejects timestamps more than 5 minutes off, which also
  rejects late retries and replays. Check your server clock if fresh requests fail.
- **One secret per endpoint.** A secret from a different endpoint won't verify.
- **CSRF middleware** must be disabled on the webhook route.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "Invalid signature" | Wrong secret, or body was parsed/re-serialized before verification |
| Fresh requests pass, retries or replays fail | Stale `svix-timestamp` rejected by the library: use the manual verifier |
| Fails only after deploys or proxies | A proxy or middleware rewrote the body or stripped headers |
| "Timestamp too old" / "too new" | Server clock drift, or a retry/replay of an old delivery |
| Missing headers | Something in front of your app dropped `svix-*` headers |

Use **Send Example** on the endpoint in **Settings → Webhooks** to send a correctly signed
request while debugging.
