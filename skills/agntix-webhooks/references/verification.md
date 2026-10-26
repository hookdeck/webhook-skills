# How to Verify Agntix Webhook Signatures

## How Does Agntix Sign Webhooks?

Agntix signs every delivery per Standard Webhooks, with Svix's header names:

| Header | Contents |
|--------|----------|
| `svix-id` | Unique message ID |
| `svix-timestamp` | Unix timestamp in seconds when the message was sent |
| `svix-signature` | Space-separated list of `v1,<base64 signature>` entries |

Svix implements Standard Webhooks, so `webhook-id`, `webhook-timestamp`, and `webhook-signature`
carry the same values. Hookdeck's Agntix source reads the `svix-*` headers and falls back to
the `webhook-*` headers when `svix-id` is absent, and the examples here do the same.

The algorithm:

1. Build the signed content: `{svix-id}.{svix-timestamp}.{raw body}`.
2. Strip the `whsec_` prefix from the secret and base64-decode the rest. That is the HMAC key.
3. Compute HMAC-SHA256 of the signed content and base64-encode the digest.
4. Compare it in constant time against every `v1,` entry in `svix-signature`. One match is
   enough, and several entries appear during secret rotation. Ignore other versions such as `v1a`.
5. Optionally reject timestamps too far from now (the libraries use a fixed 5 minutes).

## SDK Verification (recommended)

### Node.js

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only

const prefix = req.headers['svix-id'] ? 'svix' : 'webhook'; // fall back to webhook-* headers
const id = req.headers[`${prefix}-id`];
const timestamp = req.headers[`${prefix}-timestamp`];
const signature = req.headers[`${prefix}-signature`];

new Webhook(process.env.AGNTIX_WEBHOOK_SECRET).verify(rawBody, {
  'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature,
  'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature,
});
// svix 2.x verify() returns undefined; parse rawBody yourself afterwards.
```

With Express, read the body with `express.raw({ type: '*/*' })` so any content type reaches the
verifier as a Buffer.

### Python

```python
from svix.webhooks import Webhook, WebhookVerificationError

prefix = "svix" if headers.get("svix-id") else "webhook"
id_, ts, sig = (headers.get(f"{prefix}-{name}") for name in ("id", "timestamp", "signature"))

wh = Webhook(os.environ["AGNTIX_WEBHOOK_SECRET"])
try:
    wh.verify(raw_body, {
        "svix-id": id_, "svix-timestamp": ts, "svix-signature": sig,
        "webhook-id": id_, "webhook-timestamp": ts, "webhook-signature": sig,
    })
except WebhookVerificationError:
    ...  # return 400
```

## Why Do Hookdeck Retries and Replays Fail the SDK Check?

The `svix` and `standardwebhooks` libraries always enforce a fixed 5-minute timestamp window and
expose no option to change it. Hookdeck retries and replays resend the original request,
including the original timestamp. A retry or replay more than 5 minutes after the first delivery
is rejected as "Message timestamp too old", even though the signature is valid.

If your handler sits behind Hookdeck, or you replay events for debugging, use the manual
verifier below, which drops the window (`toleranceSeconds = null`) or widens it. Replay
protection then comes from deduplicating on the envelope `id`.

## Manual Verification (configurable timestamp window)

```javascript
import crypto from 'node:crypto';

// toleranceSeconds: null disables the timestamp check; 300 matches the SDK; larger widens it
function verifyAgntix(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = null) {
  if (!id || !signatureHeader || !/^[0-9]+$/.test(timestamp ?? '') || Number(timestamp) <= 0) return false;
  if (toleranceSeconds !== null) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > toleranceSeconds) return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.`)
    .update(rawBody) // Buffer or string, exactly as received
    .digest('base64');

  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
```

```python
import base64, hashlib, hmac, re, time
from typing import Optional

def verify_agntix(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
                     secret: str, tolerance_seconds: Optional[int] = None) -> bool:
    # tolerance_seconds=None disables the timestamp check; 300 matches the SDK
    if not msg_id or not signature_header or not re.fullmatch(r"[0-9]+", timestamp or "") or int(timestamp) <= 0:
        return False
    if tolerance_seconds is not None and abs(int(time.time()) - int(timestamp)) > tolerance_seconds:
        return False
    try:
        key = base64.b64decode(secret.removeprefix("whsec_"))
    except ValueError:
        return False
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and len(sig) == len(expected) and hmac.compare_digest(sig.encode(), expected.encode()):
            return True
    return False
```

Pass it the same resolved `id`, `timestamp` and `signature` values as the SDK example above.

## Common Gotchas

- **Raw body only.** Parsing JSON and re-serializing changes whitespace and key order (Agntix's docs say to verify on "the raw request body, not a parsed JSON object"). Use
  `express.raw({ type: '*/*' })`, `await request.text()` (Next.js), or `await request.body()`
  (FastAPI).
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not the
  literal string. The `svix` library always base64-decodes, so it needs a `whsec_` secret.
- **Multiple signatures.** Split `svix-signature` on spaces and accept any matching `v1,` entry.
  Don't compare the whole header.
- **Fixed 5-minute window in the SDKs.** See the Hookdeck section above.
- **One secret per endpoint.** Each endpoint has its own `whsec_` secret, shown in the dashboard's Developer section (Svix).
- **CSRF middleware** must be disabled on the webhook route.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "Invalid signature" | Wrong secret (or the secret of a deleted-and-recreated endpoint), or the body was parsed/re-serialized before verification |
| "Missing required webhook headers" | A proxy dropped the `svix-*` headers, or the request didn't come from Agntix (Svix) |
| Fails only after deploys or proxies | A proxy or middleware rewrote the body |
| "Timestamp too old" on retries or replays | The SDK's fixed 5-minute window; use the manual verifier |
| "Timestamp too old" on first delivery | Server clock drift |
