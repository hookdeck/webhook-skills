# How to Verify Dots Webhook Signatures

## How Does Dots Sign Webhooks?

Dots' webhooks are delivered by Svix, and Dots' docs point to Svix's verification guide. Each
request includes:

| Header | Contents |
|--------|----------|
| `svix-id` | Unique message ID (stable across retries; your idempotency key) |
| `svix-timestamp` | Attempt time, Unix seconds |
| `svix-signature` | Space-delimited list of `v1,<base64 signature>` entries |

Svix implements Standard Webhooks; `webhook-id`, `webhook-timestamp`, and `webhook-signature`
carry the same values, and the Svix libraries accept either set of names. Dots' docs don't
name the headers, so `svix-*` is the Svix default. Read `svix-*` and, when `svix-id` is absent,
fall back to `webhook-*` (as Hookdeck does). Take all three values from the same set.

The algorithm:

1. Build the signed content: `{svix-id}.{svix-timestamp}.{raw body}`.
2. Strip the `whsec_` prefix from the signing secret and base64-decode the rest.
3. Compute HMAC-SHA256 of the signed content with the decoded key.
4. Base64-encode the digest.
5. Compare it (constant time) against each `v1,` entry in `svix-signature`. Any match
   passes. Several entries appear during secret rotation; other versions (such as `v1a`)
   are ignored.
6. Optionally reject timestamps too far from now (the libraries use a fixed 5 minutes).

Dots' docs don't print the secret, so the `whsec_` format is Svix's. Hookdeck treats a
`whsec_` secret as base64 after the prefix and any other secret as raw UTF-8 bytes.

## SDK Verification (recommended)

### Node.js

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only

const prefix = req.headers['svix-id'] ? 'svix' : 'webhook';
const id = req.headers[`${prefix}-id`];
const timestamp = req.headers[`${prefix}-timestamp`];
const signature = req.headers[`${prefix}-signature`];

const wh = new Webhook(process.env.DOTS_WEBHOOK_SECRET);
wh.verify(rawBody, {
  'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature,
  'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature,
});
// svix 2.x verify() returns undefined; parse rawBody yourself afterwards.
```

With Express, read the body with `express.raw({ type: '*/*' })` so any content type reaches
the verifier as a Buffer.

### Python

```python
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["DOTS_WEBHOOK_SECRET"])
try:
    wh.verify(raw_body, {
        "svix-id": id, "svix-timestamp": ts, "svix-signature": sig,
        "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sig,
    })
except (WebhookVerificationError, ValueError):
    ...  # return 400
```

The Python library raises a plain `ValueError` (not `WebhookVerificationError`) for a
malformed signature entry, so catch both.

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
function verifyDots(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = null) {
  // The timestamp must be a plain positive integer (Unix seconds)
  if (!/^[0-9]+$/.test(timestamp) || Number(timestamp) <= 0) return false;
  if (toleranceSeconds !== null) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > toleranceSeconds) return false;
  }

  // whsec_ secrets are base64 after the prefix; any other secret is used as raw UTF-8 bytes
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');
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

def verify_dots(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
                secret: str, tolerance_seconds: Optional[int] = None) -> bool:
    # tolerance_seconds=None disables the timestamp check; 300 matches the SDK
    if not re.fullmatch(r"[0-9]+", timestamp) or int(timestamp) <= 0:
        return False  # the timestamp must be a plain positive integer
    if tolerance_seconds is not None and abs(int(time.time()) - int(timestamp)) > tolerance_seconds:
        return False
    # whsec_ secrets are base64 after the prefix; any other secret is used as raw UTF-8 bytes
    key = base64.b64decode(secret[len("whsec_"):]) if secret.startswith("whsec_") else secret.encode()
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest())
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig.encode(), expected):
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
- **Don't mix header sets.** Use `svix-id`, `svix-timestamp`, and `svix-signature` together,
  or the `webhook-*` trio together.
- **One secret per endpoint.** A secret from a different endpoint won't verify.
- **CSRF middleware** must be disabled on the webhook route.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "Invalid signature" | Wrong secret (or one from another endpoint), or body was parsed/re-serialized before verification |
| Fails only after deploys or proxies | A proxy or middleware rewrote the body or stripped headers |
| "Timestamp too old" on retries or replays | The SDK's fixed 5-minute window; use the manual verifier |
| "Timestamp too old" on first delivery | Server clock drift |
| Missing headers | Something in front of your app dropped `svix-*` and `webhook-*` headers |
