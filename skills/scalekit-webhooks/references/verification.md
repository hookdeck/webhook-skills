# How to Verify Scalekit Webhook Signatures

## How Does Scalekit Sign Webhooks?

Scalekit signs every delivery according to [Standard Webhooks](https://www.standardwebhooks.com). Three headers carry the signature:

| Header | Value |
|--------|-------|
| `webhook-id` | The delivery ID. The same on every retry and replay (differs from the body's `evt_…` `id`) |
| `webhook-timestamp` | Unix seconds of this attempt. Each attempt has its own |
| `webhook-signature` | Space-separated list of `v1,<base64 signature>` entries |

The signature is computed as:

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The request is valid when any `v1,` entry matches. Other versions (such as `v1a`) are ignored. Scalekit's docs: [Verify webhook signatures](https://docs.scalekit.com/guides/webhooks-best-practices/).


## Why Does Signature Verification Matter?

Your endpoint URL is public. Without verification anyone can POST a fake `organization.directory.user_created` and make your system provision an account, or a fake `organization.directory.user_deleted` to remove one.

## Implementation

### Library Verification (recommended)

Scalekit's own SDKs expose `verifyWebhookPayload(secret, headers, payload)` (Node.js, Python, Go, Java). It takes the raw body and the three `webhook-*` headers and rejects timestamps more than 5 minutes old. The examples use [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) (npm) and [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) (PyPI). Both read the secret with its `whsec_` prefix and return the parsed payload, with the same algorithm, so no Scalekit SDK is needed just to verify.

```javascript
const { Webhook } = require('standardwebhooks');

// rawBody: the exact request body string, NOT re-serialised JSON
const event = new Webhook(process.env.SCALEKIT_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws on a bad signature or a timestamp more than 5 minutes off
```

```python
from standardwebhooks.webhooks import Webhook

event = Webhook(os.environ["SCALEKIT_WEBHOOK_SECRET"]).verify(
    await request.body(),
    {
        "webhook-id": request.headers["webhook-id"],
        "webhook-timestamp": request.headers["webhook-timestamp"],
        "webhook-signature": request.headers["webhook-signature"],
    },
)
```

**Header fallback.** The examples read the `webhook-*` headers and, when `webhook-id` is absent, the `svix-*` headers (`svix-id`, `svix-timestamp`, `svix-signature`), exactly as Hookdeck does. They then pass the three values to the library under the `webhook-*` names it expects:

```javascript
const prefix = req.get('webhook-id') ? 'webhook' : 'svix';
const headers = {
  'webhook-id': req.get(`${prefix}-id`),
  'webhook-timestamp': req.get(`${prefix}-timestamp`),
  'webhook-signature': req.get(`${prefix}-signature`),
};
```

### Manual Verification (no dependency, or to change the timestamp window)

The `standardwebhooks` libraries always enforce a fixed **5-minute** timestamp window. The Scalekit docs describe a 5-minute window too. **Hookdeck retries and replays resend the original request, including its original `webhook-timestamp`, so the library rejects them once they are more than 5 minutes old.** If you receive Scalekit webhooks through Hookdeck (or replay deliveries later), use this verifier and set `toleranceSeconds` to `null` (no window) or a wider value.

It also accepts any `whsec_` secret and, for a secret without that prefix, uses its raw UTF-8 bytes as the key (as Hookdeck does).

```javascript
const crypto = require('crypto');

// toleranceSeconds: 300 like the library, a larger number to widen it, or null for no window.
function verifyScalekit(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = 300) {
  if (!id || !timestamp || !signatureHeader) return false;
  if (!/^[0-9]+$/.test(timestamp) || Number(timestamp) <= 0) return false; // plain positive integer
  if (toleranceSeconds !== null &&
      Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;

  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.`)
    .update(rawBody) // Buffer or string, exactly as received
    .digest();

  return signatureHeader.split(' ').some((entry) => {
    const [version, signature] = entry.split(',', 2);
    if (version !== 'v1' || !signature) return false;
    const received = Buffer.from(signature, 'base64');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}
```

```python
import base64, hashlib, hmac, time
from typing import Optional

# tolerance_seconds: 300 like the library, larger to widen it, or None for no window.
def verify_scalekit(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
                secret: str, tolerance_seconds: Optional[int] = 300) -> bool:
    if not (msg_id and timestamp and signature_header):
        return False
    if not (timestamp.isascii() and timestamp.isdigit()) or int(timestamp) <= 0:
        return False  # plain positive integer
    if tolerance_seconds is not None and abs(time.time() - int(timestamp)) > tolerance_seconds:
        return False

    key = (base64.b64decode(secret[len("whsec_"):]) if secret.startswith("whsec_")
           else secret.encode("utf-8"))
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()

    for entry in signature_header.split(" "):
        version, _, signature = entry.partition(",")
        # compare_digest is constant time once the lengths are equal
        if version == "v1" and len(signature) == len(expected) and hmac.compare_digest(signature, expected):
            return True
    return False
```

## Common Gotchas

- **Raw body.** The HMAC covers the exact bytes Scalekit sent. Use `express.raw({ type: '*/*' })`, `await request.text()` or `await request.body()`. Parsing and re-serialising JSON changes whitespace and key order.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string.
- **One secret per endpoint.** Copy the full `whsec_…` value from the endpoint page in the dashboard; each endpoint has its own.
- **Multiple signatures.** `webhook-signature` can hold several space-separated entries. Accept the request if any `v1,` entry matches; ignore other versions.
- **Timestamp window.** The libraries reject timestamps more than 5 minutes from your clock, in either direction. See the manual verifier above for Hookdeck retries and replays.
- **Dedupe.** `webhook-id` is the same on every retry. The body's top-level `id` (`evt_…`) is unique per event and differs from it; either works. Don't use `data.id`, which identifies the user or organization.
- **Queues.** Verify when the request arrives, before queueing: an event that waits more than 5 minutes fails verification in a worker.

## How Do I Debug Scalekit Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong endpoint's secret, `whsec_` prefix not stripped or key not base64-decoded, or the body was parsed before verification |
| Fails only after a while in production | Server clock drift (timestamp window) |
| Hookdeck retries or replays fail, first deliveries pass | Library's fixed 5-minute window; use the manual verifier with `null` tolerance |
| Missing headers | A proxy stripped `webhook-*` headers, or the request isn't from Scalekit |

Review failed deliveries in the endpoint's message log in the Scalekit dashboard (Dashboard > Webhooks) and select **Resend** after you fix the handler.
