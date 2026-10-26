# How to Verify Meeting BaaS Webhook Signatures

## How Does Meeting BaaS Sign Webhooks?

Meeting BaaS v2 delivers account-level webhooks through Svix, so every delivery carries three headers:

| Header | Contents |
|--------|----------|
| `svix-id` | Unique message id, the same across Svix's retries of one message |
| `svix-timestamp` | Unix timestamp in seconds when the delivery was signed |
| `svix-signature` | Space-separated list of `v1,<base64 signature>` entries |

Svix implements Standard Webhooks, so `webhook-id`, `webhook-timestamp`, and `webhook-signature`
carry the same values. Hookdeck's Meeting BaaS source (`MEETING_BAAS`) reads the `svix-*` headers and falls back to
the `webhook-*` headers when `svix-id` is absent, and the examples here do the same.

The algorithm:

1. Build the signed content: `{svix-id}.{svix-timestamp}.{raw body}`.
2. Strip the `whsec_` prefix from the secret and base64-decode the rest. That is the HMAC key.
3. Compute HMAC-SHA256 of the signed content and base64-encode the digest.
4. Compare it in constant time against every `v1,` entry in `svix-signature`. One match is
   enough, and several entries can appear during secret rotation. Ignore other versions such as `v1a`.
5. Optionally reject timestamps too far from now (the library uses a fixed 5 minutes).

## SDK Verification (recommended)

### Node.js

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only

const prefix = req.headers['svix-id'] ? 'svix' : 'webhook'; // fall back to webhook-* headers
const id = req.headers[`${prefix}-id`];
const timestamp = req.headers[`${prefix}-timestamp`];
const signature = req.headers[`${prefix}-signature`];

new Webhook(process.env.MEETING_BAAS_WEBHOOK_SECRET).verify(rawBody, {
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

wh = Webhook(os.environ["MEETING_BAAS_WEBHOOK_SECRET"])
try:
    wh.verify(raw_body, {
        "svix-id": id_, "svix-timestamp": ts, "svix-signature": sig,
        "webhook-id": id_, "webhook-timestamp": ts, "webhook-signature": sig,
    })
except (WebhookVerificationError, ValueError):
    ...  # return 400 (a malformed v1 entry raises a plain ValueError)
```

## Why Do Hookdeck Retries and Replays Fail the SDK Check?

The `svix` library always enforces a fixed 5-minute timestamp window and exposes no option to
change it. Hookdeck retries and replays resend the original request, including the original
timestamp. A retry or replay more than 5 minutes after the first delivery is rejected as
"Message timestamp too old", even though the signature is valid.

If your handler sits behind Hookdeck, or you replay events for debugging (including Meeting BaaS's
`POST /v2/bots/:bot_id/resend-webhook`), use the manual verifier below, which drops the
window (`toleranceSeconds = null`) or widens it. Replay protection then comes from deduplicating
on `svix-id`.

## Manual Verification (configurable timestamp window)

```javascript
import crypto from 'node:crypto';

// toleranceSeconds: null disables the timestamp check; 300 matches the SDK; larger widens it
function verifyMeetingBaas(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = null) {
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

def verify_meeting_baas(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
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

- **Raw body only.** Parsing JSON and re-serializing changes whitespace and key order. Use
  `express.raw({ type: '*/*' })`, `await request.text()` (Next.js), or `await request.body()`
  (FastAPI).
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not the
  literal string. The `svix` library always base64-decodes, so it needs a `whsec_` secret.
- **Multiple signatures.** Split `svix-signature` on spaces and accept any matching `v1,` entry.
  Don't compare the whole header.
- **Fixed 5-minute window in the SDK.** See the Hookdeck section above.
- **Only account-level v2 webhooks are signed.** Per-bot callbacks (`callback_config`, with an
  optional `x-mb-secret` header) and v1 API webhooks carry no Svix signature and fail this check.
  Hookdeck's configuration alert says: "Only Meeting BaaS v2 account-level webhooks are supported.
  Per-bot callbacks and v1 API webhooks aren't signed this way and fail verification."
- **The secret format is inferred.** Meeting BaaS's docs print no secret. They say v2 webhooks are
  sent via Svix and tell you to use Svix's libraries, so the secret is expected to be `whsec_<base64>`.
  Each endpoint has its own secret.
- **Only 2xx counts as success.** Redirects (3xx) are retried too, so don't redirect the webhook URL.
- **CSRF middleware** must be disabled on the webhook route.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "Invalid signature" | Wrong secret (another endpoint's, or a rotated-out one), or the body was parsed/re-serialized before verification |
| "Missing required webhook headers" | A proxy dropped the `svix-*` headers |
| Fails only after deploys or proxies | A proxy or middleware rewrote the body |
| "Timestamp too old" on retries or replays | The SDK's fixed 5-minute window; use the manual verifier |
| "Timestamp too old" on first delivery | Server clock drift |
