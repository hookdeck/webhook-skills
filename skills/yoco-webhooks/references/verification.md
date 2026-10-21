# How to Verify Yoco Webhook Signatures

## How Does Yoco Sign Webhooks?

Both the Yoco API and the Checkout API sign every delivery using the [Standard Webhooks](https://www.standardwebhooks.com/) specification:

| Header | Description | Example |
|--------|-------------|---------|
| `webhook-id` | Unique identifier for the delivery (use it for deduplication) | `msg_2rHa1o5GKbP4kW3mAsYcBfTZq7N` |
| `webhook-timestamp` | Unix timestamp (seconds) when the delivery was signed | `1761033600` |
| `webhook-signature` | One or more space-separated `v1,<base64>` signatures | `v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3...` |

- **Algorithm:** HMAC-SHA256, base64-encoded
- **Signed content:** `{webhook-id}.{webhook-timestamp}.{raw body}`
- **Key:** remove the `whsec_` prefix from the secret, then base64-**decode** the rest
- **Timestamp tolerance:** Yoco recommends rejecting timestamps more than **3 minutes** from your clock
- **Secret:** returned once, when the subscription is created (see [setup.md](setup.md))

## Why Does Signature Verification Matter?

Anyone can POST to your webhook URL. Without verification, an attacker could send a fake `payment.succeeded` and get goods released without paying. The timestamp check stops replays of captured deliveries. Because the timestamp is part of the signed content, an attacker can't change it without invalidating the signature.

## SDK Verification (Recommended)

Yoco's docs recommend the open source Standard Webhooks libraries. There's no Yoco-specific SDK for this.

The libraries default to a **5-minute** tolerance. To follow Yoco's 3-minute recommendation, check the timestamp yourself before calling `verify()`, as the examples in this skill do.

### Node.js (`standardwebhooks` on npm)

```javascript
const { Webhook } = require('standardwebhooks');

const TOLERANCE_SECONDS = 3 * 60;

function verifyYocoWebhook(rawBody, headers, secret) {
  const ts = Number(headers['webhook-timestamp']);
  if (!Number.isInteger(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) {
    throw new Error('Timestamp outside the 3-minute tolerance');
  }
  // Accepts "whsec_..." as-is; returns parsed JSON or throws WebhookVerificationError
  return new Webhook(secret).verify(rawBody, headers);
}
```

- Express: put `express.raw({ type: '*/*' })` on the route and pass `req.body` (a Buffer) or `req.body.toString('utf8')`.
- Next.js App Router: `const rawBody = await request.text()`.

### Python (`standardwebhooks` on PyPI)

```python
import time
from standardwebhooks.webhooks import Webhook

def verify_yoco_webhook(raw_body: bytes, headers: dict, secret: str) -> dict:
    ts = int(headers["webhook-timestamp"])  # raises ValueError if not numeric
    if abs(int(time.time()) - ts) > 180:
        raise ValueError("Timestamp outside the 3-minute tolerance")
    return Webhook(secret).verify(raw_body, headers)
```

The Python library raises errors other than `WebhookVerificationError` for malformed input, such as a signature entry without a comma or invalid base64. Catch `Exception` around `verify()` and return `400`.

## Manual Verification (Fallback)

Use this in languages without a Standard Webhooks library, or to debug.

### Node.js

```javascript
const crypto = require('crypto');

function verifyYocoSignature(rawBody, headers, secret) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader) return false;

  // 1. Reject stale or future timestamps (Yoco recommends 3 minutes)
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 180) return false;

  // 2. Key = base64-decoded secret without the "whsec_" prefix
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');

  // 3. HMAC-SHA256 over "{id}.{timestamp}.{rawBody}", base64-encoded
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest();

  // 4. Compare against every "v1,<sig>" entry in constant time
  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const received = Buffer.from(sig, 'base64');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}
```

### Python

```python
import base64, hashlib, hmac, time

def verify_yoco_signature(raw_body: bytes, headers, secret: str) -> bool:
    msg_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    signature_header = headers.get("webhook-signature")
    if not (msg_id and timestamp and signature_header):
        return False

    try:
        if abs(int(time.time()) - int(timestamp)) > 180:
            return False
    except ValueError:
        return False

    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed_content = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed_content, hashlib.sha256).digest()).decode()

    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig, expected):
            return True
    return False
```

## Common Gotchas

- **Using the parsed body.** Sign and verify the exact raw bytes. `express.json()`, `request.json()`, or a Pydantic model re-serialises the JSON and changes the bytes.
- **Using the secret string as the key.** The key is the base64-*decoded* value after `whsec_`. Using `"whsec_..."` (or the undecoded base64 text) as the HMAC key produces a valid-looking but wrong signature.
- **Only checking the first signature.** `webhook-signature` can hold several space-separated entries (for example, during secret rotation). Accept the delivery if **any** `v1,` entry matches. Yoco's own snippet only checks the first; don't copy that.
- **Plain string comparison.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`. In Node, `timingSafeEqual` throws on length mismatch, so check lengths first.
- **5 minutes vs 3 minutes.** The Standard Webhooks libraries allow 5 minutes. Add your own 3-minute check if you want Yoco's recommended window.
- **Retries get new signatures.** Each retry carries a new `webhook-timestamp` and signature but the same `webhook-id`. Deduplicate on `webhook-id`, not on the signature.
- **Lost secret.** It can't be fetched later. Rotate it (Yoco API) or delete and re-register the webhook (Checkout API).
- **CSRF middleware.** Django, Rails, and Laravel block server-to-server POSTs without a CSRF token. Exempt the webhook route.

## How to Debug Verification Failures

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Every delivery fails | Wrong secret, or the key wasn't base64-decoded | Check `YOCO_WEBHOOK_SECRET` starts with `whsec_`; strip the prefix and decode it |
| Fails only in production | A proxy or body parser rewrites the body | Verify before any JSON parsing; check for middleware that touches the body |
| Fails intermittently with "timestamp" errors | Server clock drift | Sync the clock with NTP |
| Fails after a secret rotation | Old secret still deployed | Update `YOCO_WEBHOOK_SECRET` with the value returned by the rotate call |
| Test events pass, live ones fail | Secret from a different subscription or mode | Each subscription (and Checkout `live`/`test` webhook) has its own secret |

To compare signatures by hand, log the `webhook-id`, `webhook-timestamp`, the raw body length, and the signature you computed. Never log the secret.
