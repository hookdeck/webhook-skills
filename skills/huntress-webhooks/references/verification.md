# How to Verify Huntress Webhook Signatures

## How Does Huntress Sign Webhooks?

Huntress uses Svix to sign webhook payloads, so any Svix client library works out of
the box. Each request includes three headers. Huntress's article names them with a
`svix-` prefix, but a live **Send Test** delivery (2026-11-18) used the Standard
Webhooks `webhook-` prefix (and added `webhook-test: true`). The values and signed
content are the same either way, so read whichever is present:

| Header (live / documented) | Contents |
|----------------------------|----------|
| `webhook-id` / `svix-id` | Unique delivery ID (stable across retries; your idempotency key) |
| `webhook-timestamp` / `svix-timestamp` | Attempt time, Unix seconds |
| `webhook-signature` / `svix-signature` | Space-separated list of `v1,<base64 signature>` entries |

The algorithm (from [Svix's manual verification guide](https://docs.svix.com/receiving/verifying-payloads/how-manual)):

1. Build the signed content: `{id}.{timestamp}.{raw body}`.
2. Strip the `whsec_` prefix from the signing secret and base64-decode the rest.
3. Compute HMAC-SHA256 of the signed content with the decoded key.
4. Base64-encode the digest.
5. Compare it in constant time against every `v1,` entry in the signature header. Any
   match passes.

Huntress's own article never shows the secret; a live check on 2026-11-18 confirmed the
Portal's **View Signing Secret** value is a `whsec_` secret.

## SDK Verification (recommended)

### Node.js

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only

// Accept either prefix: a live Send Test (2026-11-18) used webhook-*, the docs say svix-*
const h = (name) => req.headers[`svix-${name}`] ?? req.headers[`webhook-${name}`];
new Webhook(process.env.HUNTRESS_WEBHOOK_SECRET).verify(rawBody, {
  'svix-id': h('id'),
  'svix-timestamp': h('timestamp'),
  'svix-signature': h('signature'),
}); // returns undefined, throws on failure; parse rawBody yourself afterwards
```

### Python

```python
from svix.webhooks import Webhook, WebhookVerificationError

def h(name):  # accept either prefix
    return headers.get(f"svix-{name}") or headers.get(f"webhook-{name}")

try:
    Webhook(os.environ["HUNTRESS_WEBHOOK_SECRET"]).verify(raw_body, {
        "svix-id": h("id"),
        "svix-timestamp": h("timestamp"),
        "svix-signature": h("signature"),
    })
except WebhookVerificationError:
    ...  # return 400
```

## Why Do Retries and Replays Fail After 5 Minutes?

The `svix` and `standardwebhooks` libraries always enforce a fixed 5-minute timestamp
window, and it can't be configured. Hookdeck retries and replays resend the original
timestamp header, so the library rejects any delivery that reaches your handler more
than 5 minutes after Huntress sent it. Use the manual verifier below when that
matters. Leave the tolerance argument as `null`/`None` to drop the window, or pass a number of seconds to widen it.
Without a window, deduplicate on the delivery ID to limit the impact of a replayed capture.
Pass the header values from whichever prefix arrived (`webhook-*` or `svix-*`).

## Manual Verification (no window enforced by default)

### Node.js

```javascript
import crypto from 'node:crypto';

// toleranceSeconds: null = no timestamp check; e.g. 86400 = accept up to a day old
function verifyHuntress(rawBody, svixId, svixTimestamp, svixSignature, secret, toleranceSeconds = null) {
  if (!/^\d+$/.test(svixTimestamp)) return false;
  if (toleranceSeconds !== null) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(svixTimestamp)) > toleranceSeconds) return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${svixId}.${svixTimestamp}.`)
    .update(rawBody) // Buffer or string: the exact bytes received
    .digest();

  let ok = false; // check every entry; don't stop at the first match
  for (const entry of svixSignature.split(' ')) {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) continue;
    const given = Buffer.from(sig, 'base64');
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) ok = true;
  }
  return ok;
}
```

### Python

```python
import base64, hashlib, hmac, time
from typing import Optional

def verify_huntress(raw_body: bytes, svix_id: str, svix_timestamp: str, svix_signature: str,
                    secret: str, tolerance_seconds: Optional[int] = None) -> bool:
    if not svix_timestamp.isascii() or not svix_timestamp.isdigit():
        return False
    if tolerance_seconds is not None and abs(int(time.time()) - int(svix_timestamp)) > tolerance_seconds:
        return False

    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{svix_id}.{svix_timestamp}.".encode() + raw_body
    expected = hmac.new(key, signed, hashlib.sha256).digest()

    ok = False  # check every entry; don't stop at the first match
    for entry in svix_signature.split(" "):
        version, _, sig = entry.partition(",")
        if version != "v1" or not sig:
            continue
        try:
            given = base64.b64decode(sig, validate=True)
        except ValueError:
            continue
        if hmac.compare_digest(given, expected):
            ok = True
    return ok
```

## Common Gotchas

- **Raw body only.** Parsing JSON and re-serializing changes whitespace and key order.
  Use `express.raw({ type: '*/*' })` (so any content type reaches you as bytes),
  `await request.text()` (Next.js), or `await request.body()` (FastAPI).
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not
  the literal string.
- **Header prefix.** Read `webhook-*` and fall back to `svix-*` (or the reverse).
  A live Send Test delivery (2026-11-18) used `webhook-*` even though Huntress's article says `svix-*`.
- **Multiple signatures.** Split the signature header on spaces and accept any matching
  `v1,` entry. Don't compare the whole header.
- **One secret per endpoint.** Each Huntress endpoint has its own signing secret.
- **Timestamp window.** SDK verification rejects timestamps more than 5 minutes off,
  which also affects Hookdeck retries and replays (see above). Check your server clock
  if fresh requests fail.
- **CSRF middleware** must be disabled on the webhook route.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "Invalid signature" | Wrong endpoint's secret, or the body was parsed/re-serialized before verification |
| Fails only behind a proxy | A proxy or middleware rewrote the body or stripped the signature headers |
| "Timestamp too old" on retries or replays | The 5-minute window against a resent original timestamp; use the manual verifier |
| "Timestamp too old" on fresh requests | Server clock drift |
| Missing headers | The handler reads only `svix-*` but the delivery used `webhook-*` (or the reverse), or something in front of your app dropped the headers |

Use **Send Test** from the endpoint's three-dot menu in the Huntress Portal to send a
correctly signed request while debugging.
