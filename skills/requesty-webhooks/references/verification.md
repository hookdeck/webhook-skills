# How to Verify Requesty Webhook Signatures

## How Does Requesty Sign Webhooks?

Requesty signs the webhooks it sends for your organisation (spending alerts of every type, and sample
requests) following the [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks)
specification. Each request carries these headers:

| Header | Contents |
|--------|----------|
| `webhook-id` | Unique message ID. For alerts it is the payload's `id`; for sample requests it is the `request_id`. The same on every retry |
| `webhook-timestamp` | Unix timestamp in seconds when this delivery attempt was sent |
| `webhook-signature` | One or more space-separated `v1,<base64 signature>` entries. Several appear while a rotated secret is in its grace period |
| `X-Requesty-Event` | The event type, such as `org.balance.below_absolute` or `sample.request`. Not part of the signature |

Each retry is signed again: same `webhook-id`, new `webhook-timestamp` and `webhook-signature`.

Hookdeck's Requesty source reads `webhook-*` and falls back to the `svix-*` header names (`svix-id`,
`svix-timestamp`, `svix-signature`) when `webhook-id` is absent, and the examples here do the same.

> **Unsigned until a secret exists.** Webhooks go out unsigned until your organisation has a signing secret,
> and are always signed once one exists. Hookdeck's configuration alert for this source reads: "Create a
> signing secret for your Requesty organization. Until one exists, deliveries are unsigned and fail
> verification." Slack and Teams alert webhooks ignore the signature headers, so only your JSON endpoint and
> sample request receivers need to verify.

The algorithm:

1. Read the raw request body bytes. Do not parse and re-serialize.
2. Build the signed content: `{webhook-id}.{webhook-timestamp}.{raw body}`.
3. Take the organisation's signing secret (`whsec_` + base64). Strip `whsec_` and base64-decode the rest.
   That is the HMAC key.
4. Compute HMAC-SHA256 of the signed content and base64-encode the digest.
5. Compare it in constant time against every `v1,` entry in `webhook-signature`. One match is enough.
   Ignore other versions such as `v1a`.
6. Reject timestamps more than 5 minutes from the current time (Requesty's instruction, and what the libraries
   do).

## Library Verification (recommended)

Requesty's docs point to any Standard Webhooks or Svix library. The examples use the `standardwebhooks`
package (npm and PyPI). It reads `webhook-id`, `webhook-timestamp` and `webhook-signature`, so when a delivery
arrives with `svix-*` headers, pass the same three values under the `webhook-*` names.

### Node.js

```javascript
const { Webhook } = require('standardwebhooks');

const prefix = req.get('webhook-id') ? 'webhook' : 'svix'; // fall back to svix-* headers
const headers = {
  'webhook-id': req.get(`${prefix}-id`),
  'webhook-timestamp': req.get(`${prefix}-timestamp`),
  'webhook-signature': req.get(`${prefix}-signature`),
};

// rawBody: the Buffer/string exactly as received (express.raw({ type: '*/*' }))
const body = new Webhook(process.env.REQUESTY_WEBHOOK_SECRET).verify(rawBody, headers);
// Throws on a bad signature or a timestamp outside the window; returns the parsed JSON.
```

### Python

```python
import os
from standardwebhooks.webhooks import Webhook, WebhookVerificationError

prefix = "webhook" if headers.get("webhook-id") else "svix"
signature_headers = {
    "webhook-id": headers.get(f"{prefix}-id"),
    "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
    "webhook-signature": headers.get(f"{prefix}-signature"),
}

try:
    body = Webhook(os.environ["REQUESTY_WEBHOOK_SECRET"]).verify(raw_body, signature_headers)
except WebhookVerificationError:
    ...  # return 400
```

## Why Do Hookdeck Retries and Replays Fail the Library Check?

The `standardwebhooks` libraries always enforce a fixed 5-minute timestamp window and expose no option to
change it. Hookdeck retries and replays resend the original request, including the original
`webhook-timestamp`. A retry or replay more than 5 minutes after the first delivery is rejected as
"Message timestamp too old", even though the signature is valid.

If your handler sits behind Hookdeck, or you replay events for debugging, use the manual verifier below,
which drops the window (`toleranceSeconds = null`) or widens it. Replay protection then comes from
deduplicating on `webhook-id`.

## Manual Verification (configurable timestamp window)

Requesty secrets start with `whsec_`, and the key is the base64-decoded remainder. As in Hookdeck's source, a
secret without that prefix is used as its raw UTF-8 bytes. Requesty's own docs include a manual verifier with a
fixed 5-minute window. This one makes the window optional.

```javascript
const crypto = require('node:crypto');

// toleranceSeconds: null disables the timestamp check; 300 matches the SDK; larger widens it
function verifyRequesty(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = null) {
  if (!id || !signatureHeader || !/^[0-9]+$/.test(timestamp ?? '') || Number(timestamp) <= 0) return false;
  if (toleranceSeconds !== null) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > toleranceSeconds) return false;
  }

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

def verify_requesty(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
                secret: str, tolerance_seconds: Optional[int] = None) -> bool:
    # tolerance_seconds=None disables the timestamp check; 300 matches the SDK
    if not msg_id or not signature_header or not re.fullmatch(r"[0-9]+", timestamp or "") or int(timestamp) <= 0:
        return False
    if tolerance_seconds is not None and abs(int(time.time()) - int(timestamp)) > tolerance_seconds:
        return False
    try:
        key = base64.b64decode(secret[len("whsec_"):]) if secret.startswith("whsec_") else secret.encode()
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
  `express.raw({ type: '*/*' })`, `await request.text()` (Next.js), or `await request.body()` (FastAPI).
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not the literal string.
  Keep the full `whsec_...` value in `REQUESTY_WEBHOOK_SECRET`.
- **Multiple signatures.** Split `webhook-signature` on spaces and accept any matching `v1,` entry. During a
  rotation grace period (default 24 hours, up to 5 active secrets) there is one entry per active secret. Don't
  compare the whole header.
- **Fixed 5-minute window in the libraries.** See the Hookdeck section above.
- **One secret per organisation.** All alert and sample request webhooks use it. Rotating it keeps the old
  secret signing for the grace period you choose, so update `REQUESTY_WEBHOOK_SECRET` before it ends.
- **Dedupe on `webhook-id`.** It is the alert `id` (or the sample `request_id`) and stays the same across
  retries, while the timestamp and signature change.
- **Event name comes from `X-Requesty-Event`.** Alert bodies carry the same value as a top-level `type`, but
  sample request bodies (`{request_id, request, response}`) have none.
- **CSRF middleware** must be disabled on the webhook route.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Deliveries arrive with no `webhook-*` headers | The organisation has no signing secret yet. Generate one (Admin Panel > Alerts) |
| Every request fails with "Invalid signature" | Wrong secret, secret missing the `whsec_` prefix, or the body was parsed/re-serialized before verification |
| "Missing signature headers" | A proxy dropped the `webhook-*` headers, or the delivery is a Slack/Teams type webhook sent to the wrong URL |
| Fails right after a rotation | Your endpoint still has the old secret and the grace period ended |
| "Message timestamp too old" on retries or replays | The library's fixed 5-minute window; use the manual verifier |
| "Message timestamp too old" on first delivery | Server clock drift |
