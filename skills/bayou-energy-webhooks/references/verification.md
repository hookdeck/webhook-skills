# How to Verify Bayou Energy Webhook Signatures

## How Does Bayou Energy Sign Webhooks?

Bayou follows the [Standard Webhooks](https://www.standardwebhooks.com/) specification. Every delivery is an HTTP POST with three headers:

| Header | Example | Description |
|--------|---------|-------------|
| `webhook-id` | `wh_12345` | Unique identifier for this webhook message |
| `webhook-timestamp` | `1750000000` | Unix timestamp (seconds) when the webhook was sent |
| `webhook-signature` | `v1,yW3priuFZD+w+ji8R8...` | One or more space-delimited, versioned signatures |

The signature is computed as:

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The request is authentic if any `v1,` entry matches. Bayou's docs say to reject deliveries whose timestamp is more than 5 minutes from the current time.

**Test vector from Bayou's docs:** secret `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`, `webhook-id` `wh_12345`, `webhook-timestamp` `1750000000`, body `{"event": "bills_ready", "object": {"id": 123456}}` gives `v1,yW3priuFZD+w+ji8R847LYfQxOKmZlBAHEt7OQP0CMI=`.

## Why Does Signature Verification Matter?

Bayou delivers webhooks whether or not you verify them, and your endpoint URL is public. Without verification, anyone can POST a fake `new_bill` or `customer_must_reauthenticate` event.

## Implementation

### Library Verification (recommended)

[`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) (npm, PyPI) reads the `webhook-*` headers, so pass them through unchanged.

```javascript
const { Webhook } = require('standardwebhooks');

// rawBody: the exact request body string, NOT re-serialised JSON
const event = new Webhook(process.env.BAYOU_ENERGY_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws on bad signature or a timestamp more than 5 minutes off
```

```python
from standardwebhooks.webhooks import Webhook

event = Webhook(os.environ["BAYOU_ENERGY_WEBHOOK_SECRET"]).verify(
    await request.body(),
    {
        "webhook-id": request.headers["webhook-id"],
        "webhook-timestamp": request.headers["webhook-timestamp"],
        "webhook-signature": request.headers["webhook-signature"],
    },
)
```

The library always enforces a fixed 5-minute timestamp window and cannot be configured.

### Manual Verification (no dependency, configurable window)

Use this if you can't add a dependency, or if you receive Bayou webhooks through Hookdeck. Hookdeck retries and replays resend the **original** `webhook-timestamp`, so the library rejects them once they are 5 minutes old. Set `windowSeconds` to `null` to drop the check, or to a larger number to widen it.

```javascript
const crypto = require('crypto');

function verifyBayou(rawBody, id, timestamp, signatureHeader, secret, windowSeconds = 300) {
  if (!id || !timestamp || !signatureHeader || !secret) return false;
  // Plain positive integer only (no "1e9", " 12", "0x10", "-5")
  if (!/^[1-9]\d*$/.test(timestamp)) return false;
  if (windowSeconds !== null && Math.abs(Date.now() / 1000 - Number(timestamp)) > windowSeconds) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
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
from typing import Optional

def verify_bayou(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
                 secret: str, window_seconds: Optional[int] = 300) -> bool:
    if not (msg_id and timestamp and signature_header and secret):
        return False
    if not re.fullmatch(r"[1-9][0-9]*", timestamp):  # plain positive integer only
        return False
    if window_seconds is not None and abs(time.time() - int(timestamp)) > window_seconds:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = hmac.new(key, signed, hashlib.sha256).digest()
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

- **Raw body.** The HMAC covers the exact bytes Bayou sent. Use `express.raw()`, `await request.text()` or `await request.body()`. Parsing and re-serialising JSON changes whitespace and key order (Bayou's own test body has a space after each colon).
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string.
- **Keep `whsec_` in the env var.** `BAYOU_ENERGY_WEBHOOK_SECRET` holds the full dashboard value; the library strips the prefix itself.
- **Multiple signatures.** The header can hold several space-separated entries during secret rotation. Accept the request if any `v1,` entry matches. Ignore other versions.
- **One secret per company.** The same secret verifies every Bayou webhook for the company.
- **Timestamp window with retries and replays.** The library's 5-minute window rejects late retries and replays that keep the original timestamp (Hookdeck does this). Use the manual verifier with a wider or disabled window if that matters to you, and dedupe on `webhook-id` instead.
- **No event ID in the body.** Dedupe on `webhook-id`.

## How Do I Debug Bayou Energy Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong secret, key not base64-decoded, or the body was parsed before verification |
| Missing headers | A proxy stripped `webhook-*` headers, or the request isn't from Bayou |
| Fails for replayed or retried events only | Timestamp older than 5 minutes (library window). Use the manual verifier |
| Fails only after a while in production | Server clock drift. Keep NTP running |
| Handler returns 500 | `BAYOU_ENERGY_WEBHOOK_SECRET` is unset (handlers fail closed) |

To check your implementation, run the test vector above through your verifier with `windowSeconds` disabled.
