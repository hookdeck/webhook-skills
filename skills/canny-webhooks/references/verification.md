# How to Verify Canny Webhook Signatures

## How Does Canny Sign Webhooks?

Canny follows the [Standard Webhooks](https://www.standardwebhooks.com/) specification. Each request carries:

| Header | Value |
|--------|-------|
| `webhook-id` | Unique identifier for the message |
| `webhook-timestamp` | Seconds since the UNIX epoch, covered by the signature |
| `webhook-signature` | One or more space-separated `v1,<base64>` entries |

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The request is valid when any `v1,` entry matches. After you regenerate the secret, Canny signs with both the old and new secret for 24 hours, so there are two entries.

## Why Does Signature Verification Matter?

Your endpoint URL is public. Without verification, anyone can POST a fake `post.status_changed` or `vote.created` event.

## Implementation

### Library Verification (default in the examples)

Canny points to the official Standard Webhooks libraries ([`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) on npm and PyPI, also `svix`). Pass the raw body exactly as received.

```javascript
const { Webhook } = require('standardwebhooks');

const event = new Webhook(process.env.CANNY_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws on bad signature or a timestamp more than 5 minutes off
```

```python
from standardwebhooks.webhooks import Webhook

event = Webhook(os.environ["CANNY_WEBHOOK_SECRET"]).verify(
    await request.body(),
    {
        "webhook-id": request.headers["webhook-id"],
        "webhook-timestamp": request.headers["webhook-timestamp"],
        "webhook-signature": request.headers["webhook-signature"],
    },
)
```

**The libraries always enforce a fixed 5-minute timestamp window and have no option to change it.** Hookdeck retries and replays resend the original request, so `webhook-timestamp` is the time Canny first signed it. A retry or replay later than 5 minutes fails with a signature error even though the signature is valid. Use the manual verifier below when deliveries can arrive late.

### Manual Verification (configurable timestamp window)

Dependency-free, and the window is yours to set: `toleranceSeconds = null` drops the check (rely on `webhook-id` dedupe instead), or pass a larger number such as `86400`.

```javascript
const crypto = require('crypto');

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

function verifyCanny(rawBody, headers, secret, toleranceSeconds = null) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const header = headers['webhook-signature'];
  if (!id || !timestamp || !header || !/^\d+$/.test(timestamp)) return false;
  if (toleranceSeconds !== null && Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) {
    return false;
  }
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.`)
    .update(rawBody) // Buffer or string, exactly as received
    .digest();
  // Check every entry (no early exit on the first match or mismatch)
  let ok = false;
  for (const entry of header.split(' ')) {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig || !B64.test(sig)) continue;
    const received = Buffer.from(sig, 'base64');
    if (received.length === expected.length && crypto.timingSafeEqual(received, expected)) ok = true;
  }
  return ok;
}
```

```python
import base64, binascii, hashlib, hmac, time
from typing import Optional

def verify_canny(raw_body: bytes, headers, secret: str, tolerance_seconds: Optional[int] = None) -> bool:
    msg_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    header = headers.get("webhook-signature")
    if not msg_id or not timestamp or not header or not timestamp.isascii() or not timestamp.isdigit():
        return False
    if tolerance_seconds is not None and abs(time.time() - int(timestamp)) > tolerance_seconds:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = hmac.new(key, signed, hashlib.sha256).digest()
    ok = False
    for entry in header.split(" "):
        version, _, sig = entry.partition(",")
        if version != "v1" or not sig:
            continue
        try:
            received = base64.b64decode(sig, validate=True)
        except (binascii.Error, ValueError):
            continue
        if hmac.compare_digest(received, expected):  # bytes vs bytes: no TypeError on odd input
            ok = True
    return ok
```

## Common Gotchas

- **Raw body.** The HMAC covers the exact bytes Canny sent. Use `express.raw({ type: '*/*' })` (so any content type verifies), `await request.text()` or `await request.body()`. Re-serialised JSON changes whitespace and key order.
- **Decode the secret.** The key is the base64-decoded part after `whsec_`, not the literal string.
- **Two signatures during rotation.** `webhook-signature` can hold two entries for 24 hours. Match any of them.
- **5-minute window vs retries.** See above: library checks fail for late retries and replays. Hookdeck retries keep the original timestamp.
- **Legacy `canny-*` headers.** `canny-timestamp`, `canny-nonce` and `canny-signature` are legacy and being removed. They don't protect the body. Ignore them.
- **No event ID in the body.** Dedupe on `webhook-id`.

## How Do I Debug Canny Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong secret, `whsec_` prefix not stripped or key not base64-decoded (manual verifier), or the body was parsed before verification |
| Genuine events fail only when retried or replayed | The 5-minute timestamp window. Switch to the manual verifier and widen or drop the window |
| Fails right after regenerating the secret | `CANNY_WEBHOOK_SECRET` still holds the old value. Copy the new one from API settings |
| Missing `webhook-*` headers | A proxy stripped them, or the sender is not Canny (only `canny-*` headers means an unsigned legacy setup) |
