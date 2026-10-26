# How to Verify Basiq Webhook Signatures

## How Does Basiq Sign Webhooks?

Basiq uses the [Standard Webhooks](https://www.standardwebhooks.com/) scheme. Each endpoint has one signing secret (`whsec_...`).

| Header | Value |
|--------|-------|
| `webhook-id` | Unique message ID |
| `webhook-timestamp` | Unix timestamp in seconds |
| `webhook-signature` | One or more space-separated `v1,<base64 signature>` entries |

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The request is valid when any `v1,` entry matches.

## Why Does Signature Verification Matter?

Your endpoint URL is public. Without verification, anyone can POST a fake `consent.revoked` or `transactions.updated` notification and make your app re-fetch or delete real financial data.

## Implementation

### Library Verification (recommended)

Use the Standard Webhooks library ([`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) on npm, [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) on PyPI). It reads the `webhook-*` headers and returns the parsed payload.

```javascript
const { Webhook } = require('standardwebhooks');

// rawBody: the exact request body string, NOT re-serialised JSON
const event = new Webhook(process.env.BASIQ_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws on a bad signature or a timestamp more than 5 minutes off
```

```python
from standardwebhooks.webhooks import Webhook

event = Webhook(os.environ["BASIQ_WEBHOOK_SECRET"]).verify(
    await request.body(),
    {
        "webhook-id": request.headers["webhook-id"],
        "webhook-timestamp": request.headers["webhook-timestamp"],
        "webhook-signature": request.headers["webhook-signature"],
    },
)
```

**The library always enforces a fixed 5-minute timestamp window.** Hookdeck retries and replays resend the original `webhook-timestamp`, so the library rejects them once they are more than 5 minutes old. If that matters to you, use the manual verifier below.

### Manual Verification (no dependency, adjustable timestamp window)

`tolerance_sec` of `0` skips the window; a positive value opts in and can be set wider than 5 minutes.

```javascript
const crypto = require('crypto');

// rawBody: Buffer of the exact bytes received. Returns true when valid.
function verifyBasiq(rawBody, id, timestamp, signatureHeader, secret, toleranceSec = 0) {
  if (!id || !signatureHeader || !/^[1-9]\d*$/.test(timestamp ?? '')) return false; // plain positive integer
  if (toleranceSec > 0 && Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSec) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64'); // decode; don't use the string as-is
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest();
  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}
```

```python
import base64, hashlib, hmac, time

def verify_basiq(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
                 secret: str, tolerance_sec: int = 0) -> bool:
    if not (msg_id and signature_header and timestamp and timestamp.isascii()
            and timestamp.isdigit() and int(timestamp) > 0):
        return False  # timestamp must be a plain positive integer
    if tolerance_sec > 0 and abs(time.time() - int(timestamp)) > tolerance_sec:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version != "v1" or not sig:
            continue
        try:
            given = base64.b64decode(sig, validate=True)
        except ValueError:
            continue
        if len(given) == len(expected) and hmac.compare_digest(given, expected):
            return True
    return False
```

Every `v1,` entry is checked in constant time after a length check. Other versions are ignored.

## Common Gotchas

- **Raw body.** The HMAC covers the exact bytes Basiq sent. In Express use `express.raw({ type: '*/*' })` so any content type verifies; in Next.js `await request.text()`; in FastAPI `await request.body()`. Parse the JSON only after the check.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string.
- **One secret per endpoint.** A staging subscription's secret won't verify production deliveries.
- **Multiple signatures.** `webhook-signature` can hold several space-separated entries. Accept the request if any `v1,` entry matches.
- **Retries and replays keep the original timestamp.** The library's 5-minute window rejects a Hookdeck retry or replay that arrives later. Use the manual verifier to drop or widen the window.
- **Header names.** Basiq uses `webhook-*`, not `svix-*`.
- **Fail closed.** If `BASIQ_WEBHOOK_SECRET` is unset, return `500` rather than skipping verification.

## How Do I Debug Basiq Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong secret, `whsec_` prefix not stripped or key not base64-decoded, or the body was parsed before verification |
| Fails on retries or replays only | The library's 5-minute window; use the manual verifier |
| Fails only after a while in production | Server clock drift |
| Missing headers | A proxy stripped `webhook-*` headers, or the request isn't from Basiq |
