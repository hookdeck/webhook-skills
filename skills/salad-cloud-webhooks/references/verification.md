# How to Verify SaladCloud Webhook Signatures

## How Does SaladCloud Sign Webhooks?

SaladCloud signs every Job Queue webhook following the
[Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks) specification. Each request
carries three headers:

| Header | Contents |
|--------|----------|
| `webhook-id` | Unique delivery identifier |
| `webhook-timestamp` | Unix timestamp in seconds when the webhook was sent |
| `webhook-signature` | One or more space-separated `v1,<base64 signature>` entries |

SaladCloud's guide shows the `svix` library, which implements the same scheme. Hookdeck's SaladCloud source
reads `webhook-*` and falls back to the `svix-*` header names (`svix-id`, `svix-timestamp`,
`svix-signature`) when `webhook-id` is absent, and the examples here do the same.

The algorithm:

1. Read the raw request body bytes. Do not parse and re-serialize.
2. Build the signed content: `{webhook-id}.{webhook-timestamp}.{raw body}`.
3. Base64-decode the secret. SaladCloud's secret has no `whsec_` prefix; if one is present, strip it first.
   The decoded bytes are the HMAC key.
4. Compute HMAC-SHA256 of the signed content and base64-encode the digest.
5. Compare it in constant time against every `v1,` entry in `webhook-signature`. One match is enough.
   Ignore other versions such as `v1a`.
6. Optionally reject timestamps too far from now (the libraries use 5 minutes).

## SDK Verification (recommended)

The examples use the `standardwebhooks` package (npm and PyPI). It reads `webhook-id`, `webhook-timestamp`
and `webhook-signature`, so when a delivery arrives with `svix-*` headers, pass the same three values under
the `webhook-*` names. SaladCloud's own guide uses `svix`: `new Webhook(secret).verify(rawBody, headers)`.
That works too, with the bare secret as is.

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
const event = new Webhook(process.env.SALAD_CLOUD_WEBHOOK_SECRET).verify(rawBody, headers);
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
    event = Webhook(os.environ["SALAD_CLOUD_WEBHOOK_SECRET"]).verify(raw_body, signature_headers)
except WebhookVerificationError:
    ...  # return 400
```

## Why Do Hookdeck Retries and Replays Fail the SDK Check?

The `standardwebhooks` libraries always enforce a fixed 5-minute timestamp window and expose no option to
change it. Hookdeck retries and replays resend the original request, including the original
`webhook-timestamp`. A retry or replay more than 5 minutes after the first delivery is rejected as
"Message timestamp too old", even though the signature is valid.

If your handler sits behind Hookdeck, or you replay events for debugging, use the manual verifier below,
which drops the window (`toleranceSeconds = null`) or widens it. Replay protection then comes from
deduplicating on `webhook-id`.

## Manual Verification (configurable timestamp window)

The key is the base64-decoded secret. SaladCloud's secret is bare base64; a `whsec_` prefix, if you have
added one for Hookdeck, is stripped first.

```javascript
const crypto = require('node:crypto');

// toleranceSeconds: null disables the timestamp check; 300 matches the SDK; larger widens it
function verifySalad(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = null) {
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

def verify_salad(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
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

- **Raw body only.** Parsing JSON and re-serializing changes whitespace and key order. SaladCloud's guide
  says to use the raw body exactly as received. Use `express.raw({ type: '*/*' })`, `await request.text()`
  (Next.js), or `await request.body()` (FastAPI).
- **Decode the secret.** The HMAC key is the base64-decoded bytes, not the literal string. SaladCloud's
  secret has no `whsec_` prefix, and the library handles that.
- **Hookdeck needs `whsec_`.** Hookdeck uses a secret without that prefix as raw bytes. Paste
  `whsec_` + the portal secret into the Hookdeck source: "SaladCloud shows the secret without a prefix.
  Paste it as whsec_ followed by the secret, or verification fails."
- **Multiple signatures.** Split `webhook-signature` on spaces and accept any matching `v1,` entry. Don't
  compare the whole header.
- **Fixed 5-minute window in the libraries.** See the Hookdeck section above.
- **Event name is `type`**, not `data.events[].type`.
- **CSRF middleware** must be disabled on the webhook route.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "Invalid signature" | Wrong secret, or the body was parsed/re-serialized before verification |
| Fails in Hookdeck only | Source secret pasted without the `whsec_` prefix |
| "Missing signature headers" | A proxy dropped the `webhook-*` headers |
| Fails only after deploys or proxies | A proxy or middleware rewrote the body |
| "Message timestamp too old" on retries or replays | The library's fixed 5-minute window; use the manual verifier |
| "Message timestamp too old" on first delivery | Server clock drift |
