# How to Verify Crossmint Webhook Signatures

## How Does Crossmint Sign Webhooks?

Crossmint webhooks are delivered by Svix. Each request includes:

| Header | Contents |
|--------|----------|
| `svix-id` | Message ID (stable across retries; your idempotency key) |
| `svix-timestamp` | Unix seconds |
| `svix-signature` | Space-delimited list of `v1,<base64 signature>` entries |

Svix implements Standard Webhooks, whose `webhook-id`, `webhook-timestamp` and `webhook-signature` headers carry the same values. The Svix libraries accept either set of names, and Hookdeck reads the `webhook-*` names when `svix-id` is absent, so the examples do the same.

The algorithm:

1. Signed content: `{svix-id}.{svix-timestamp}.{raw body}`.
2. Strip `whsec_` from the webhook secret and base64-decode the rest to get the key.
3. HMAC-SHA256 the signed content with that key and base64-encode the digest.
4. Compare it in constant time against each `v1,` entry. Any match passes; ignore other versions such as `v1a`.

Crossmint's manual section says to HMAC with the base64 portion of the signing secret (the part after `whsec_`) and recommends the Svix library over the manual route.

## SDK Verification (recommended)

### Node.js

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only

const p = headers['svix-id'] ? 'svix' : 'webhook';
const [id, timestamp, signature] = ['id', 'timestamp', 'signature'].map((k) => headers[`${p}-${k}`]);
new Webhook(process.env.CROSSMINT_WEBHOOK_SECRET).verify(rawBody, {
  'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature,
  'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature,
});
// svix 2.x verify() returns undefined; parse rawBody yourself afterwards.
```

With Express, read the body with `express.raw({ type: '*/*' })` so any content type reaches the verifier as a Buffer.

### Python

```python
from svix.webhooks import Webhook, WebhookVerificationError

p = "svix" if headers.get("svix-id") else "webhook"
msg_id, ts, sig = (headers.get(f"{p}-{k}") for k in ("id", "timestamp", "signature"))
try:
    Webhook(os.environ["CROSSMINT_WEBHOOK_SECRET"]).verify(raw_body, {
        "svix-id": msg_id, "svix-timestamp": ts, "svix-signature": sig,
        "webhook-id": msg_id, "webhook-timestamp": ts, "webhook-signature": sig,
    })
except WebhookVerificationError:
    ...  # return 400
```

## Why Do Hookdeck Retries and Replays Fail the SDK Check?

The `svix` library always enforces a fixed 5-minute timestamp window and has no option to change it. Hookdeck retries and replays resend the original request, including the original `svix-timestamp`. A retry or replay more than 5 minutes after the first delivery is rejected as "Message timestamp too old", even though the signature is valid.

If your handler sits behind Hookdeck, or you replay events for debugging, use the manual verifier below, which drops the window (`toleranceSeconds = null`) or widens it. Replay protection then comes from deduplicating on `svix-id`.

## Manual Verification (configurable timestamp window)

```javascript
import crypto from 'node:crypto';

// toleranceSeconds: null disables the timestamp check; 300 matches the SDK; larger widens it
function verifyCrossmint(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = null) {
  // The timestamp must be a plain positive integer, even when no window is applied
  if (!/^\d+$/.test(timestamp) || Number(timestamp) <= 0) return false;
  if (toleranceSeconds !== null && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) {
    return false;
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

def verify_crossmint(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
                       secret: str, tolerance_seconds: Optional[int] = None) -> bool:
    # tolerance_seconds=None disables the timestamp check; 300 matches the SDK
    if not re.fullmatch(r"[0-9]+", timestamp) or int(timestamp) <= 0:
        return False
    if tolerance_seconds is not None and abs(int(time.time()) - int(timestamp)) > tolerance_seconds:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig.encode(), expected.encode()):
            return True
    return False
```

## Common Gotchas

- **Raw body only.** Parsing JSON and re-serializing changes whitespace and key order. Use `express.raw({ type: '*/*' })`, `await request.text()` (Next.js), or `await request.body()` (FastAPI).
- **The event type is in the body.** Read the top-level `type`, but only after verifying. The id is `id` or `actionId` depending on the product, and Checkout V2 `purchase.succeeded` has no `data`.
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not the literal string.
- **Multiple signatures.** Split `svix-signature` on spaces and accept any matching `v1,` entry. Don't compare the whole header.
- **Fixed 5-minute window in the SDK.** See the Hookdeck section above.
- **Header names.** Frameworks lower-case them; read `svix-id`, then fall back to `webhook-id`.
- **CSRF middleware** must be disabled on the webhook route.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "Invalid signature" | Wrong secret, or body was parsed/re-serialized before verification |
| Fails only after deploys or proxies | A proxy or middleware rewrote the body or stripped headers |
| "Timestamp too old" on retries or replays | The SDK's fixed 5-minute window; use the manual verifier |
| "Timestamp too old" on first delivery | Server clock drift |
| Missing headers | Something in front of your app dropped `svix-*` headers |
| Verifies but `type` is `null` | The body has no top-level `type`; log it and ignore the event |
| Secret from the wrong console | Staging and production endpoints have different secrets |
