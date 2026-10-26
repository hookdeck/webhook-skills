# How to Verify Argil Webhook Signatures

## How Does Argil Sign Webhooks?

Argil signs webhooks per [Standard Webhooks](https://www.standardwebhooks.com/):

| Header | Value |
|--------|-------|
| `webhook-id` | Unique message ID, the same on every retry |
| `webhook-timestamp` | Unix timestamp (seconds) |
| `webhook-signature` | Space-separated list of `v1,<base64 signature>` entries |

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The request is valid when any `v1,` entry matches. Other versions (for example `v1a`) are ignored. The secret is returned once by `POST /webhooks` and looks like `whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD`. Only webhooks created since signing shipped are signed; see [setup](setup.md).

## Implementation

### Library Verification

Argil publishes no webhook SDK. Use the `standardwebhooks` library (npm, PyPI). It reads `webhook-id`, `webhook-timestamp` and `webhook-signature` directly and returns the parsed payload.

```javascript
const { Webhook } = require('standardwebhooks');

const event = new Webhook(process.env.ARGIL_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws on bad signature or a timestamp more than 5 minutes off
```

```python
from standardwebhooks.webhooks import Webhook

event = Webhook(os.environ["ARGIL_WEBHOOK_SECRET"]).verify(
    await request.body(),
    {
        "webhook-id": request.headers["webhook-id"],
        "webhook-timestamp": request.headers["webhook-timestamp"],
        "webhook-signature": request.headers["webhook-signature"],
    },
)
```

### Why Does the Library Reject Late Retries?

The library always enforces a fixed 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, and Hookdeck itself applies no timestamp window. A retry that arrives more than 5 minutes after the original is rejected by the library even though the signature is valid. Argil's own retries (30 s, 2 min, 10 min, 1 h, 6 h, ...) hit the same limit after the first few.

### Manual Verification (no timestamp window by default)

Use this behind Hookdeck, or when you want to drop or widen the window. Set `MAX_AGE_SECONDS` to a number to enforce one.

```javascript
const crypto = require('crypto');

const MAX_AGE_SECONDS = null; // e.g. 86400 to accept up to a day old

function verifyArgil(rawBody, id, timestamp, signatureHeader, secret) {
  if (!id || !timestamp || !signatureHeader || !secret) return false;
  // Plain positive integer only (no "1e9", " 12", "-5", "0x10")
  if (!/^[1-9][0-9]*$/.test(timestamp)) return false;
  if (MAX_AGE_SECONDS !== null && Math.abs(Date.now() / 1000 - Number(timestamp)) > MAX_AGE_SECONDS) return false;

  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest();

  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const received = Buffer.from(sig, 'base64');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}
```

```python
import base64, hashlib, hmac, re, time

MAX_AGE_SECONDS = None  # e.g. 86400 to accept up to a day old

def verify_argil(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str, secret: str) -> bool:
    if not (msg_id and timestamp and signature_header and secret):
        return False
    if not re.fullmatch(r"[1-9][0-9]*", timestamp):
        return False
    if MAX_AGE_SECONDS is not None and abs(time.time() - int(timestamp)) > MAX_AGE_SECONDS:
        return False
    key = base64.b64decode(secret[len("whsec_"):]) if secret.startswith("whsec_") else secret.encode()
    expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version != "v1" or not sig:
            continue
        try:
            received = base64.b64decode(sig, validate=True)
        except ValueError:
            continue
        if len(received) == len(expected) and hmac.compare_digest(received, expected):
            return True
    return False
```

## Common Gotchas

- **Unsigned legacy webhooks.** Webhooks created before Argil added signing carry no signature headers. Recreate them to get a `whsec_` secret.
- **Raw body.** The HMAC covers the exact bytes Argil sent. Use `express.raw({ type: '*/*' })`, `await request.text()` or `await request.body()`. Parsing and re-serialising JSON changes whitespace and key order.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string.
- **The secret is shown once.** If you lose it, recreate the webhook.
- **Multiple signatures.** Accept the request if any `v1,` entry matches.
- **Timestamp window.** The library enforces 5 minutes and rejects late retries and replays. Use the manual verifier to drop or widen it.
- **No event ID in the body.** Dedupe on `webhook-id`.

## How Do I Debug Argil Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| No `webhook-*` headers at all | The webhook predates signing: recreate it |
| Every request fails | Wrong secret, key not base64-decoded, or the body was parsed before verification |
| Fresh deliveries pass, retries and replays fail | The library's 5-minute window: use the manual verifier |
| Fails only in production | A proxy or middleware changed the body or stripped `webhook-*` headers |
