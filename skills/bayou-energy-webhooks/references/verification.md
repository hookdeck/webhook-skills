# How to Verify Bayou Energy Webhook Signatures

## How Does Bayou Sign Webhooks?

Bayou follows the [Standard Webhooks](https://www.standardwebhooks.com/) spec. Every delivery is a `POST` with three headers:

| Header | Example | Description |
|--------|---------|-------------|
| `webhook-id` | `wh_12345` | Unique identifier for this webhook message |
| `webhook-timestamp` | `1750000000` | Unix timestamp (seconds) when the webhook was sent |
| `webhook-signature` | `v1,yW3priuFZD+w+ji8R8...` | One or more space-delimited signatures of the request body |

The signature is computed as:

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The delivery is authentic if any `v1,` entry matches. Bayou's docs also say to reject a timestamp more than 5 minutes from the current time.

## Why Does Signature Verification Matter?

Your webhook URL is public, and Bayou delivers whether or not you verify. Without verification anyone can POST a fake `customer_must_reauthenticate` or `new_bill` event.

## Implementation

### Library Verification (recommended)

[`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) (npm, PyPI) is what Bayou's docs recommend. It returns the parsed body and throws on failure.

```javascript
const { Webhook } = require('standardwebhooks');

// rawBody: the exact request body string, NOT re-serialised JSON
const payload = new Webhook(process.env.BAYOU_ENERGY_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // { event, object }; throws on bad signature or a timestamp more than 5 minutes off
```

```python
from standardwebhooks.webhooks import Webhook

payload = Webhook(os.environ["BAYOU_ENERGY_WEBHOOK_SECRET"]).verify(
    await request.body(),
    {
        "webhook-id": request.headers["webhook-id"],
        "webhook-timestamp": request.headers["webhook-timestamp"],
        "webhook-signature": request.headers["webhook-signature"],
    },
)
```

The Python library raises a plain `ValueError` (not `WebhookVerificationError`) for a malformed signature entry or timestamp, so catch `Exception` and answer 400.

**Header fallback.** The examples read `webhook-*` and, when `webhook-id` is absent, use `svix-id`, `svix-timestamp` and `svix-signature` instead, as Hookdeck does. They pass the values to the library under the `webhook-*` names it expects.

### Manual Verification (configurable window)

The library's 5-minute window is fixed. **Hookdeck retries and replays resend the original timestamp**, so a retry that arrives after 5 minutes fails the library check even though the signature is valid. Use this verifier to drop the window (`None`/`null`) or widen it.

```javascript
const crypto = require('crypto');

// windowSeconds: null to skip the timestamp check (e.g. behind Hookdeck retries)
function verifyBayou(rawBody, id, timestamp, signatureHeader, secret, windowSeconds = 300) {
  if (!id || !timestamp || !signatureHeader) return false;
  if (!/^[0-9]+$/.test(timestamp) || Number(timestamp) <= 0) return false; // plain positive integer
  if (windowSeconds !== null && Math.abs(Date.now() / 1000 - Number(timestamp)) > windowSeconds) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false; // ignore other versions
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
    if not (msg_id and timestamp and signature_header):
        return False
    if not re.fullmatch(r"[0-9]+", timestamp) or int(timestamp) <= 0:  # plain positive integer
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

Check it against the documented vector: secret `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`, id `wh_12345`, timestamp `1750000000`, body `{"event": "bills_ready", "object": {"id": 123456}}` gives `v1,yW3priuFZD+w+ji8R847LYfQxOKmZlBAHEt7OQP0CMI=` (pass `windowSeconds = null`).

## Common Gotchas

- **Raw body.** The HMAC covers the exact bytes Bayou sent. Use `express.raw({ type: '*/*' })`, `await request.text()` or `await request.body()`. Parsing and re-serialising JSON changes whitespace and key order. Parse only after the check passes.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string. `BAYOU_ENERGY_WEBHOOK_SECRET` holds the full `whsec_` value.
- **Multiple signatures.** `webhook-signature` can hold several space-separated entries during secret rotation. Accept the request if any `v1,` entry matches, and ignore other versions.
- **Timestamp window and retries.** The library rejects timestamps more than 5 minutes from your clock, and replays or late retries through Hookdeck carry the original timestamp. Use the manual verifier to widen or drop the window, and keep your clock in sync with NTP.
- **One secret per company.** Use the secret from the company that owns the webhook URL.
- **No event ID.** Dedupe on `webhook-id`.
- **Fail closed.** If the secret env var is unset, return 500 instead of accepting the delivery.

## How Do I Debug Bayou Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong secret, `whsec_` prefix not stripped or key not base64-decoded (manual), or the body was parsed before verification |
| Fails on retries or replays only | The 5-minute window. Use the manual verifier with a wider or no window |
| Fails only in production | Server clock drift, or a proxy re-encoded the body |
| Missing headers | A proxy stripped the `webhook-*` headers, or the request isn't from Bayou |

To compare against a known-good signature, run the documented test vector above through your verifier.
