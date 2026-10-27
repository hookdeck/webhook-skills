# How to Verify Velt Webhook Signatures

## How Does Velt Sign Webhooks?

Velt Advanced (V2) webhooks are delivered through Svix and signed following the
[Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks) specification. Each request
carries three headers:

> Hookdeck's configuration alert for this source reads: "Only Velt Advanced (V2) webhooks, available on Enterprise, are signed. Basic (V1) webhooks send an auth token instead and fail verification." Basic (V1) webhooks only send an optional auth token in the
> `Authorization` header (`Basic <token>`), so there is no signature to verify on them.

| Header | Contents |
|--------|----------|
| `webhook-id` | Message id, unique across messages and the same on every retry of that message |
| `webhook-timestamp` | Unix timestamp in seconds when that attempt was signed. It changes between Velt retries |
| `webhook-signature` | One or more space-separated `v1,<base64 signature>` entries |

Hookdeck's Velt source reads `webhook-*` and falls back to the `svix-*` header names (`svix-id`,
`svix-timestamp`, `svix-signature`) when `webhook-id` is absent, and the examples here do the same.

The algorithm:

1. Read the raw request body bytes. Do not parse and re-serialize.
2. Build the signed content: `{webhook-id}.{webhook-timestamp}.{raw body}`.
3. Take the endpoint's signing secret (`whsec_` + base64). Strip `whsec_` and base64-decode the rest.
   That is the HMAC key.
4. Compute HMAC-SHA256 of the signed content and base64-encode the digest.
5. Compare it in constant time against every `v1,` entry in `webhook-signature`. One match is enough.
   Ignore other versions such as `v1a`.
6. Optionally reject timestamps too far from now. Velt's docs tell you to compare the timestamp against
   your clock within your own tolerance; the libraries enforce 5 minutes.

## SDK Verification (recommended)

Velt's examples use the Standard Webhooks signing scheme, so the examples here use the `standardwebhooks` package (npm and PyPI). It reads `webhook-id`,
`webhook-timestamp` and `webhook-signature`, so when a delivery arrives with `svix-*` headers, pass the same
three values under the `webhook-*` names.

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
const event = new Webhook(process.env.VELT_WEBHOOK_SECRET).verify(rawBody, headers);
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
    event = Webhook(os.environ["VELT_WEBHOOK_SECRET"]).verify(raw_body, signature_headers)
except WebhookVerificationError:
    ...  # return 400
```

## Why Do Hookdeck Retries and Replays Fail the SDK Check?

The `standardwebhooks` libraries always enforce a fixed 5-minute timestamp window and expose no option to
change it. Hookdeck retries and replays resend the original request, including the original
`webhook-timestamp`. A retry or replay more than 5 minutes after the first delivery is rejected as
"Message timestamp too old", even though the signature is valid. (Velt's own retries are fine: each
attempt is re-signed with a fresh `webhook-timestamp`.)

If your handler sits behind Hookdeck, or you replay events for debugging, use the manual verifier below,
which drops the window (`toleranceSeconds = null`) or widens it. Replay protection then comes from
deduplicating on the `webhook-id` header.

## Manual Verification (configurable timestamp window)

Velt secrets start with `whsec_`, and the key is the base64-decoded remainder ("the base64 portion of
your signing secret (this is the part after the `whsec_` prefix)"). As in Hookdeck's source, a secret
without that prefix is used as its raw UTF-8 bytes.

```javascript
const crypto = require('node:crypto');

// toleranceSeconds: null disables the timestamp check; 300 matches the SDK; larger widens it
function verifyVelt(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = null) {
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

def verify_velt(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
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

- **Raw body only.** Parsing JSON and re-serializing changes whitespace and key order. Velt says you
  should not change the body in any way before verifying. Use `express.raw({ type: '*/*' })`,
  `await request.text()` (Next.js), or `await request.body()` (FastAPI).
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not the literal string.
  Keep the full `whsec_...` value in `VELT_WEBHOOK_SECRET`.
- **Multiple signatures.** Split `webhook-signature` on spaces and accept any matching `v1,` entry. Don't
  compare the whole header.
- **Fixed 5-minute window in the libraries.** See the Hookdeck section above.
- **One secret per endpoint.** Verify each request with the secret of the endpoint it was sent to.
  Use the secret shown for that endpoint in the Velt console.
- **Dedupe on `webhook-id`.** It is the same when a message is resent, while `webhook-timestamp` changes.
- **Payload encoding and encryption.** When enabled in the console (both are off by default), the body is
  Base64-encoded or an `{encryptedData, encryptedKey, iv}` object (AES-256-CBC, key wrapped with RSA-OAEP
  SHA-256). The signature still covers the raw delivered body, so verify first and decode or decrypt after.
- **Basic (V1) webhooks fail.** They are unsigned. Use an Advanced (V2) endpoint (Enterprise).
- **CSRF middleware** must be disabled on the webhook route.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "Invalid signature" | Wrong secret (each endpoint has its own), a regenerated secret not yet updated, secret missing the `whsec_` prefix, or the body was parsed/re-serialized before verification |
| "Missing signature headers" | A proxy dropped the `webhook-*` headers |
| Fails only after deploys or proxies | A proxy or middleware rewrote the body |
| "Message timestamp too old" on retries or replays | The library's fixed 5-minute window; use the manual verifier |
| "Message timestamp too old" on first delivery | Server clock drift |
| Test events from the console's Testing tab fail | Same checks as above: they are signed with the endpoint's secret like any delivery |
| Verification fails on a Basic (V1) webhook | V1 is unsigned and sends `Authorization: Basic <token>` instead; use Advanced (V2) |
