# How to Verify iSnap Webhook Signatures

## How Does iSnap Sign Webhooks?

iSnap follows [Standard Webhooks](https://standardwebhooks.com/). Every request (deliveries, retries, replays and probes) includes:

| Header | Contents |
|--------|----------|
| `webhook-id` | The event's `event_id` (`evt_...`). Same on every attempt, on a replay and for every subscription that receives the event. Your idempotency key |
| `webhook-timestamp` | Unix seconds when this attempt was sent. Changes on every attempt |
| `webhook-signature` | `v1,<base64 signature>` for this attempt |

The `X-iSnap-*` headers are not signed. Svix uses the same scheme under `svix-id`, `svix-timestamp` and `svix-signature`. Hookdeck reads the `webhook-*` names and falls back to the `svix-*` names when `webhook-id` is absent, so the examples do the same and then hand the library the values under the `webhook-*` names it expects.

The algorithm:

1. Signed content: `{webhook-id}.{webhook-timestamp}.{raw body}`. The body is compact UTF-8 JSON, exactly as received.
2. Strip the `whsec_` prefix from the secret and base64-decode the rest to get the key (48 bytes). It is not the hex decoding of those 64 characters, and not the secret string itself.
3. HMAC-SHA256 the signed content with that key and base64-encode the digest.
4. Compare it in constant time against each `v1,` entry (split on spaces). Any match passes; ignore other versions such as `v1a`.
5. Reject the request if `webhook-timestamp` is too far from the current time. iSnap recommends 300 seconds either way, and the Standard Webhooks libraries use 5 minutes.

## SDK Verification (recommended)

### Node.js

```javascript
const { Webhook } = require('standardwebhooks'); // CommonJS; `import { Webhook } from 'standardwebhooks'` also works

const p = headers['webhook-id'] ? 'webhook' : 'svix';
new Webhook(process.env.ISNAP_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': headers[`${p}-id`],
  'webhook-timestamp': headers[`${p}-timestamp`],
  'webhook-signature': headers[`${p}-signature`],
}, { jsonParse: false });
// verify() throws on failure. With jsonParse: false it returns undefined; parse rawBody yourself afterwards.
```

With Express, read the body with `express.raw({ type: '*/*' })` so any content type reaches the verifier as a Buffer.

### Python

```python
from standardwebhooks.webhooks import Webhook

p = "webhook" if headers.get("webhook-id") else "svix"
try:
    Webhook(os.environ["ISNAP_WEBHOOK_SECRET"]).verify(
        raw_body,
        {
            "webhook-id": headers.get(f"{p}-id"),
            "webhook-timestamp": headers.get(f"{p}-timestamp"),
            "webhook-signature": headers.get(f"{p}-signature"),
        },
        json_parse=False,
    )
except Exception:  # WebhookVerificationError, or ValueError for a malformed signature entry
    ...  # return 401
```

### iSnap's own SDK

iSnap's `@isnap/sdk` has `verifyWebhook(rawBody, headers, secret, { tolerance })` (Node.js 20+ or Bun 1.2+, default tolerance 300 seconds, `secret` can be an array during a rotation). It reads the `webhook-*` headers only, so use `standardwebhooks` if you need the `svix-*` fallback. The documentation also gives dependency-free `node:crypto` and Python standard-library verifiers; the manual verifier below is the same idea with a configurable window.

## Why Do Hookdeck Retries and Replays Fail the SDK Check?

The `standardwebhooks` library always enforces a fixed 5-minute timestamp window and has no option to change it. iSnap re-stamps every attempt, so a direct retry always carries a fresh timestamp. Hookdeck retries and replays resend the original request, including the original `webhook-timestamp`. A retry or replay more than 5 minutes after the first delivery is rejected as "Message timestamp too old", even though the signature is valid.

If your handler sits behind Hookdeck, or you replay events for debugging, use the manual verifier below, which drops the window (`toleranceSeconds = null`) or widens it. Replay protection then comes from deduplicating on `event_id` (the `webhook-id` header).

## Manual Verification (configurable timestamp window)

```javascript
const crypto = require('node:crypto');

// secret: one whsec_ string, or an array during a rotation
// toleranceSeconds: null disables the timestamp check; 300 matches iSnap's guidance; larger widens it
function verifyIsnap(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = null) {
  // The timestamp must be a plain positive integer, even when no window is applied
  if (!/^\d+$/.test(timestamp) || Number(timestamp) <= 0) return false;
  if (toleranceSeconds !== null && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) {
    return false;
  }

  const given = signatureHeader.split(' ').flatMap((entry) => {
    const [version, sig] = entry.split(',');
    return version === 'v1' && sig ? [Buffer.from(sig)] : [];
  });

  return [secret].flat().some((candidate) => {
    const key = Buffer.from(candidate.replace(/^whsec_/, ''), 'base64');
    const expected = Buffer.from(
      crypto
        .createHmac('sha256', key)
        .update(`${id}.${timestamp}.`)
        .update(rawBody) // Buffer or string, exactly as received
        .digest('base64')
    );
    return given.some((sig) => sig.length === expected.length && crypto.timingSafeEqual(sig, expected));
  });
}
```

```python
import base64, hashlib, hmac, re, time
from typing import Optional, Union

def verify_isnap(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
                 secret: Union[str, list], tolerance_seconds: Optional[int] = None) -> bool:
    # tolerance_seconds=None disables the timestamp check; 300 matches iSnap's guidance
    if not re.fullmatch(r"[0-9]+", timestamp) or int(timestamp) <= 0:
        return False
    if tolerance_seconds is not None and abs(int(time.time()) - int(timestamp)) > tolerance_seconds:
        return False
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    given = []
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and sig:
            given.append(sig.encode())
    for candidate in [secret] if isinstance(secret, str) else secret:
        key = base64.b64decode(candidate.removeprefix("whsec_"))
        expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest())
        if any(len(sig) == len(expected) and hmac.compare_digest(sig, expected) for sig in given):
            return True
    return False
```

Call it with the values resolved from the `webhook-*` or `svix-*` headers, and reply `401` when it returns false.

## Test Vector

iSnap publishes a fake vector to check your code before going live. The secret is `whsec_00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff`, `webhook-id` is `evt_2Yc8RkP4mWq7Lx3Nv9Tb5Hs1D`, `webhook-timestamp` is `1760000000`, and the body is this 288-byte line with no trailing newline:

```json
{"api_version":"v1","event_id":"evt_2Yc8RkP4mWq7Lx3Nv9Tb5Hs1D","event_type":"webhook.test","created_at":"2025-10-09T08:53:20.000Z","trace_id":"0af7651916cd43dd8448eb211c80319c","data":{"webhook_id":"11111111-2222-3333-4444-555555555555","probe":true,"metadata":null,"line_metadata":null}}
```

The expected header is `webhook-signature: v1,ushTjsgTdwRRBRQL1d56b6HFFwfVHNqiwwtkAn0HlsI=`. If you compute `v1,29SNUfgyZggRY4lxdCHTW2jcxTEA11sbup1oHxq0F0c=`, you hex-decoded the secret; decode it as base64. The timestamp is in the past, so the SDK check needs a wide tolerance (or a clock set to `1760000000`) for this vector only. The manual verifier accepts it with `toleranceSeconds = null`.

## Common Gotchas

- **Raw body only.** Parsing JSON and re-serializing changes whitespace and key order, and a replay can order keys differently. Use `express.raw({ type: '*/*' })`, `await request.text()` (Next.js), or `await request.body()` (FastAPI). iSnap's own Express sample uses `express.raw({ type: 'application/json' })`; `'*/*'` also works when the content type is odd.
- **Decode the secret as base64**, not hex, and not as the literal string.
- **Multiple signatures.** Split `webhook-signature` on spaces and accept any matching `v1,` entry. Don't compare the whole header.
- **Never answer `410` to a failed verification.** iSnap sets the subscription to `active: false` immediately and the events that occur meanwhile are lost. Use `400` for missing headers and `401` for a bad signature (iSnap retries those).
- **Fixed 5-minute window in the library.** See the Hookdeck section above.
- **Secret rotation has no overlap.** After `POST /v1/webhooks/{id}/rotate-secret`, iSnap signs with the new secret only. Verify against both secrets for the changeover; the examples accept a comma-separated `ISNAP_WEBHOOK_SECRET`.
- **One secret per subscription.** A delivery doesn't say which subscription sent it, so two subscriptions on one URL need every secret tried.
- **Header names.** Frameworks lower-case them; read `webhook-id`, then fall back to `svix-id`.
- **Read the type from the body.** `X-iSnap-Event` is unsigned.
- **CSRF middleware** must be disabled on the webhook route.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "No matching signature found" | Wrong secret (another subscription's, or a rotated one), the secret was hex-decoded, or the body was parsed/re-serialized before verification |
| Fails only after deploys or proxies | A proxy or middleware rewrote the body or stripped headers |
| "Message timestamp too old" on retries or replays | The library's fixed 5-minute window on a Hookdeck retry or replay; use the manual verifier |
| "Message timestamp too old" on first delivery | Server clock drift |
| Missing headers | Something in front of your app dropped `webhook-*` headers |
| Subscription stopped receiving events | Suspended (resumes on a successful `webhook.test` probe) or inactive after a `410` (`PATCH` with `active: true`) |
