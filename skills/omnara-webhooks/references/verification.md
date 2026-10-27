# How to Verify Omnara Webhook Signatures

## How Does Omnara Sign Webhooks?

Omnara follows [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md),
but only when the agent config sets `event_webhook.signing_secret_id`. Signed deliveries carry:

| Header | Contents |
|--------|----------|
| `webhook-id` | Unique delivery ID (stable across retries; your idempotency key) |
| `webhook-timestamp` | Unix timestamp in seconds for that attempt |
| `webhook-signature` | Space-separated list of `v1,<base64 signature>` entries |

Unsigned deliveries still carry `webhook-id` and `webhook-timestamp` but no `webhook-signature`.

Svix's header names (`svix-id`, `svix-timestamp`, `svix-signature`) carry the same values.
Hookdeck's Omnara source reads the `webhook-*` headers and also accepts the `svix-*` set, and
the examples do the same: use `webhook-*` when `webhook-id` is present, otherwise `svix-*`.
Then hand the library the three values under the `webhook-*` names it expects.

The algorithm:

1. Build the signed content: `{webhook-id}.{webhook-timestamp}.{raw body}`.
2. Derive the HMAC key from the secret: strip a `whsec_` prefix if present and base64-decode
   the rest (Omnara's own secret is bare base64 from `openssl rand -base64 32`, so you decode all of it).
3. Compute HMAC-SHA256 of the signed content and base64-encode the digest.
4. Compare it in constant time against every `v1,` entry in `webhook-signature`. One match is
   enough. Ignore other versions such as `v1a`.
5. Optionally reject timestamps too far from now (the library uses a fixed 5 minutes).

## SDK Verification (recommended)

### Node.js

```javascript
const { Webhook } = require('standardwebhooks');

const prefix = req.headers['webhook-id'] ? 'webhook' : 'svix'; // fall back to svix-* headers
const payload = new Webhook(process.env.OMNARA_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.headers[`${prefix}-id`],
  'webhook-timestamp': req.headers[`${prefix}-timestamp`],
  'webhook-signature': req.headers[`${prefix}-signature`],
});
// verify() returns the parsed JSON body. It throws on a bad signature or stale timestamp,
// and a SyntaxError if the signed body is not JSON.
```

With Express, read the body with `express.raw({ type: '*/*' })` so any content type reaches the
verifier as a Buffer.

### Python

```python
from standardwebhooks.webhooks import Webhook, WebhookVerificationError

prefix = "webhook" if headers.get("webhook-id") else "svix"  # fall back to svix-* headers
try:
    payload = Webhook(os.environ["OMNARA_WEBHOOK_SECRET"]).verify(raw_body, {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    })
except json.JSONDecodeError:
    ...  # signed body is not JSON: return 400
except (WebhookVerificationError, ValueError):
    ...  # return 400 (a malformed v1 entry raises a plain ValueError)
```

## Why Do Hookdeck Retries and Replays Fail the SDK Check?

The `standardwebhooks` library always enforces a fixed 5-minute timestamp window and exposes no
option to change it. Hookdeck retries and replays resend the original request, including the
original `webhook-timestamp`. A retry or replay more than 5 minutes after the first delivery is
rejected as a timestamp error, even though the signature is valid.

If your handler sits behind Hookdeck, or you replay events for debugging, use the manual
verifier below, which drops the window (`toleranceSeconds = null`) or widens it. Replay
protection then comes from deduplicating on `webhook-id`.

## Manual Verification (configurable timestamp window)

```javascript
const crypto = require('node:crypto');

// toleranceSeconds: null disables the timestamp check; 300 matches the SDK; larger widens it
function verifyOmnara(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = null) {
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

def verify_omnara(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
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

- **Signing is opt-in.** Without `event_webhook.signing_secret_id` there is no `webhook-signature`
  and nothing to verify. Hookdeck's alert says: "Signing is opt-in per agent: set
  event_webhook.signing_secret_id, then paste that secret here as whsec_ followed by the secret.
  Unsigned deliveries fail verification."
- **Raw body only.** Parsing JSON and re-serializing changes whitespace and key order. Use
  `express.raw({ type: '*/*' })`, `await request.text()` (Next.js), or `await request.body()` (FastAPI).
- **Decode the secret.** The HMAC key is the base64-decoded secret, not the literal string.
- **Multiple signatures.** Split `webhook-signature` on spaces and accept any matching `v1,` entry.
- **Fixed 5-minute window in the SDKs.** See the Hookdeck section above.
- **Fail closed.** If `OMNARA_WEBHOOK_SECRET` is unset, return an error instead of accepting the request.
- **CSRF middleware** must be disabled on the webhook route.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| "Missing required webhook headers" | Agent has no `signing_secret_id` (unsigned delivery), or a proxy dropped the headers |
| Every request fails with "Invalid signature" | Wrong secret, or the body was parsed/re-serialized before verification |
| Fails only after deploys or proxies | A proxy or middleware rewrote the body |
| "Timestamp too old" on retries or replays | The SDK's fixed 5-minute window; use the manual verifier |
| "Timestamp too old" on first delivery | Server clock drift |
