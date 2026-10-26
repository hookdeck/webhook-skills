# How to Verify Monerium Webhook Signatures

## How Does Monerium Sign Webhooks?

Monerium follows [Standard Webhooks](https://standardwebhooks.com/). Each request includes:

| Header | Contents |
|--------|----------|
| `webhook-id` | Message ID (stable across retries; your idempotency key) |
| `webhook-timestamp` | Unix seconds when the message was sent |
| `webhook-signature` | Space-delimited list of `v1,<base64 signature>` entries, usually one |

Svix uses the same scheme under `svix-id`, `svix-timestamp` and `svix-signature`. Hookdeck reads the `webhook-*` names and falls back to the `svix-*` names when `webhook-id` is absent, so the examples do the same and then hand the library the values under the `webhook-*` names it expects.

The algorithm:

1. Signed content: `{webhook-id}.{webhook-timestamp}.{raw body}`.
2. Take the secret after the `whsec_` prefix and base64-decode it to get the key. For `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw` the key is `MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw` base64-decoded.
3. HMAC-SHA256 the signed content with that key and base64-encode the digest.
4. Compare it in constant time against each `v1,` entry. Any match passes; ignore other versions such as `v2`.
5. Reject the request if `webhook-timestamp` is too far from the current time. The Standard Webhooks libraries allow 5 minutes; Monerium's guide does not check it.

## SDK Verification (recommended)

### Node.js

```javascript
const { Webhook } = require('standardwebhooks'); // CommonJS; `import { Webhook } from 'standardwebhooks'` also works

const p = headers['webhook-id'] ? 'webhook' : 'svix';
new Webhook(process.env.MONERIUM_WEBHOOK_SECRET).verify(rawBody, {
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
    Webhook(os.environ["MONERIUM_WEBHOOK_SECRET"]).verify(
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

### Monerium's own example

Monerium's guide verifies by hand, comparing the whole `webhook-signature` header with `v1,${expected}` using `!==`. That works for a single entry but is not constant-time, rejects a header with several `v1,` entries, and applies no timestamp check. Prefer the library or the manual verifier below. Whichever you use, hand it the raw bytes: the guide reads the body with `express.raw({ type: 'application/json' })`, and the examples use `express.raw({ type: '*/*' })` so a different content type still verifies.

## Why Do Hookdeck Retries and Replays Fail the SDK Check?

The `standardwebhooks` library always enforces a fixed 5-minute timestamp window and has no option to change it. Hookdeck retries and replays resend the original request, including the original `webhook-timestamp`. A retry or replay more than 5 minutes after the first delivery is rejected as "Message timestamp too old", even though the signature is valid. Monerium retries up to 10 times over 12 hours with exponential backoff, so later attempts can fall well outside the 5-minute window when Monerium retries into a handler that has been down.

If your handler sits behind Hookdeck, or you replay events for debugging, use the manual verifier below, which drops the window (`toleranceSeconds = null`) or widens it. Replay protection then comes from deduplicating on `webhook-id`.

## Manual Verification (configurable timestamp window)

```javascript
const crypto = require('node:crypto');

// toleranceSeconds: null disables the timestamp check; 300 matches the SDK; larger widens it
function verifyMonerium(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = null) {
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

def verify_monerium(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
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

Call it with the values resolved from the `webhook-*` or `svix-*` headers, and reply `401` when it returns false.

## Common Gotchas

- **Raw body only.** Parsing JSON and re-serializing changes whitespace and key order. Use `express.raw({ type: '*/*' })`, `await request.text()` (Next.js), or `await request.body()` (FastAPI). Parse the JSON only after the check.
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not the literal string.
- **Multiple signatures.** Split `webhook-signature` on spaces and accept any matching `v1,` entry. Don't compare the whole header. Ignore versions other than `v1`.
- **Fixed 5-minute window in the library.** See the Hookdeck section above.
- **Header names.** Frameworks lower-case them; read `webhook-id`, then fall back to `svix-id`.
- **CSRF middleware** must be disabled on the webhook route.
- **You choose the secret.** Monerium doesn't issue it: use the exact `whsec_` value you sent in `POST /webhooks`, and keep it.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "No matching signature found" | Wrong secret (not the one you sent in `POST /webhooks`), or the body was parsed/re-serialized before verification |
| Fails only after deploys or proxies | A proxy or middleware rewrote the body or stripped headers |
| "Message timestamp too old" on retries or replays | The library's fixed 5-minute window; use the manual verifier |
| "Message timestamp too old" on first delivery | Server clock drift |
| Missing headers | Something in front of your app dropped `webhook-*` headers |
| 500 "Server configuration error" from the examples | `MONERIUM_WEBHOOK_SECRET` is unset or doesn't start with `whsec_` |
