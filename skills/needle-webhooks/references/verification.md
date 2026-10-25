# How to Verify Needle Webhook Signatures

## How Does Needle Signing Work?

Needle's headers follow [Standard Webhooks](https://www.standardwebhooks.com/), so its libraries can check them. A request that fails the check did not come from Needle.

| Header | Description |
|--------|-------------|
| `webhook-id` | The event id. The same value is sent when a request is sent again |
| `webhook-timestamp` | When this request was sent, in Unix seconds |
| `webhook-signature` | `v1,<base64>`; can hold several entries separated by spaces |

- **Algorithm:** HMAC-SHA256, base64-encoded
- **Signed content:** `{webhook-id}.{webhook-timestamp}.{raw request body}`
- **Key:** the secret (`whsec_...`) with the `whsec_` prefix removed, then **base64-decoded**
- **Comparison:** constant-time, against every `v1,` entry
- **Timestamp:** the libraries refuse a request more than 5 minutes from your server's clock

## SDK Verification (recommended)

**Node.js** (`npm install standardwebhooks`):

```javascript
const { Webhook } = require('standardwebhooks');

const wh = new Webhook(process.env.NEEDLE_WEBHOOK_SECRET); // full "whsec_..." value
const event = wh.verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws on bad signature or stale timestamp; returns parsed JSON
```

**Python** (`pip install standardwebhooks`):

```python
from standardwebhooks.webhooks import Webhook

wh = Webhook(os.environ["NEEDLE_WEBHOOK_SECRET"])
event = wh.verify(raw_body, {
    "webhook-id": request.headers["webhook-id"],
    "webhook-timestamp": request.headers["webhook-timestamp"],
    "webhook-signature": request.headers["webhook-signature"],
})  # raises WebhookVerificationError
```

## Why Are Hookdeck Retries and Replays Rejected?

The library enforces a **fixed 5-minute** window and it can't be changed. Needle defines `webhook-timestamp` as "when this request was sent", so Needle's own retries (right away, +10 minutes, +1 hour) carry a fresh timestamp. Hookdeck retries and replays resend the **original** `webhook-timestamp`, so one that lands more than 5 minutes after Needle sent the request fails with a timestamp error even though the signature is valid. Use the manual verifier below, which lets you drop the window (`toleranceSec = null`) or widen it. Dedupe on `webhook-id` instead of relying on freshness.

## Manual Verification (no fixed window)

```javascript
const crypto = require('crypto');

// toleranceSec: null drops the window; a number widens or narrows it
function verifyNeedle(rawBody, headers, secret, toleranceSec = null) {
  const id = headers['webhook-id'];
  const ts = headers['webhook-timestamp'];
  const sigHeader = headers['webhook-signature'];
  if (!id || !ts || !sigHeader) return false;
  if (!/^[0-9]+$/.test(ts) || Number(ts) <= 0) return false; // plain positive integer
  if (toleranceSec !== null && Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSec) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${ts}.`).update(rawBody).digest();

  return sigHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const received = Buffer.from(sig, 'base64');
    // canonical base64 only: Buffer.from ignores invalid characters
    return received.toString('base64') === sig && received.length === expected.length &&
      crypto.timingSafeEqual(received, expected);
  });
}
```

```python
import base64, hashlib, hmac, time

def verify_needle(raw_body: bytes, headers, secret: str, tolerance=None) -> bool:
    msg_id = headers.get("webhook-id")
    ts = headers.get("webhook-timestamp")
    sig_header = headers.get("webhook-signature")
    if not (msg_id and ts and sig_header):
        return False
    if not (ts.isascii() and ts.isdigit()) or int(ts) <= 0:  # plain positive integer
        return False
    if tolerance is not None and abs(time.time() - int(ts)) > tolerance:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{ts}.".encode() + raw_body
    expected = hmac.new(key, signed, hashlib.sha256).digest()
    for entry in sig_header.split(" "):
        version, _, sig = entry.partition(",")
        if version != "v1" or not sig:
            continue
        try:
            received = base64.b64decode(sig, validate=True)
        except ValueError:
            continue
        if hmac.compare_digest(received, expected):
            return True
    return False
```

## Common Gotchas

- **Raw body.** The signature covers the exact bytes Needle sent. `express.json()`, `request.json()` or FastAPI body models re-serialise and break verification. Use `express.raw({ type: '*/*' })` (any content type), `await request.text()` or `await request.body()`, and parse the JSON only after the check.
- **Decode the secret.** The HMAC key is `base64decode(secret without "whsec_")`, not the secret string. The libraries do this for you.
- **Several signatures.** `webhook-signature` can hold more than one `v1,` entry. Accept if any matches.
- **Custom headers aren't signed.** Headers you add to the webhook are not covered by the signature.
- **Shown once.** If you lost the secret, add the webhook again to get a new one.
- **Unordered, at least once.** Dedupe on `webhook-id`; order by the body's `timestamp`.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong secret (another webhook), or the key isn't base64-decoded |
| Fails only in production | A proxy or middleware parses or rewrites the body before your handler |
| Timestamp error on Hookdeck retries or replays only | The 5-minute window. Use the manual verifier |
| Missing headers | A proxy strips `webhook-*` headers, or the request isn't from Needle |

Log the three headers and the raw body length, recompute the HMAC with the manual function, and compare it with the `v1,` value.
