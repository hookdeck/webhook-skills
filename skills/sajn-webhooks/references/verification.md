# How to Verify sajn Webhook Signatures

## How Does sajn Sign Webhooks?

sajn signs every delivery according to [Standard Webhooks](https://www.standardwebhooks.com) (API version `2026-10` and later). Three headers carry the signature:

| Header | Value |
|--------|-------|
| `webhook-id` | The event `id` (also in the body). The same on every retry and replay |
| `webhook-timestamp` | Unix seconds of this attempt. Each attempt has its own |
| `webhook-signature` | Space-separated list of `v1,<base64 signature>` entries |

The signature is computed as:

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The request is valid when any `v1,` entry matches. For 24 hours after you rotate the secret there are two entries, one per secret. Other versions (such as `v1a`) are ignored. sajn's docs: [Verify webhook signatures](https://docs.sajn.se/webhooks/verify-signatures).

> **API version 2026-10 or later is required.** Create the sajn webhook endpoint on API version 2026-10 or later. Endpoints on the deprecated 2026-09 version sign with X-Sajn-Signature instead of Standard Webhooks and fail verification.

## Why Does Signature Verification Matter?

Your endpoint URL is public. Without verification anyone can POST a fake `document.completed` and make your system download and trust a document that was never signed.

## Implementation

### Library Verification (recommended)

sajn recommends an official Standard Webhooks library. The examples use [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) (npm) and [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) (PyPI). Both read the secret with its `whsec_` prefix and return the parsed payload.

```javascript
const { Webhook } = require('standardwebhooks');

// rawBody: the exact request body string, NOT re-serialised JSON
const event = new Webhook(process.env.SAJN_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws on a bad signature or a timestamp more than 5 minutes off
```

```python
from standardwebhooks.webhooks import Webhook

event = Webhook(os.environ["SAJN_WEBHOOK_SECRET"]).verify(
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

The `standardwebhooks` libraries always enforce a fixed **5-minute** timestamp window. sajn signs each attempt with a fresh timestamp, so sajn's own retries pass. **Hookdeck retries and replays resend the original request, including its original `webhook-timestamp`, so the library rejects them once they are more than 5 minutes old.** If you receive sajn webhooks through Hookdeck (or replay deliveries later), use this verifier and set `toleranceSeconds` to `null` (no window) or a wider value.

It also accepts any `whsec_` secret and, for a secret without that prefix, uses its raw UTF-8 bytes as the key (as Hookdeck does).

```javascript
const crypto = require('crypto');

// toleranceSeconds: 300 like the library, a larger number to widen it, or null for no window.
function verifySajn(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = 300) {
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
def verify_sajn(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
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

- **Raw body.** The HMAC covers the exact bytes sajn sent. Use `express.raw({ type: '*/*' })`, `await request.text()` or `await request.body()`. Parsing and re-serialising JSON changes whitespace and key order.
- **API version.** Endpoints on `2026-09` send `X-Sajn-Signature` (plus `X-Sajn-Delivery`, `X-Sajn-Environment`, `X-Sajn-Secret`) and a different body, so Standard Webhooks verification fails. Create the endpoint on `2026-10` or later, or PATCH its `apiVersion` and rotate the secret.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string.
- **One secret per endpoint and environment.** A staging endpoint's secret won't verify production deliveries. sajn returns the secret only on create and on rotation.
- **Multiple signatures.** During the 24 hours after a rotation `webhook-signature` holds two entries. Accept the request if any `v1,` entry matches.
- **Timestamp window.** The libraries reject timestamps more than 5 minutes from your clock, in either direction. See the manual verifier above for Hookdeck retries and replays.
- **Dedupe on the event `id`.** It equals `webhook-id` and is stable across retries, replays and endpoints.
- **Dashboard save check.** When you save a webhook in the dashboard, sajn first POSTs an unsigned `{"test": true}` (user agent `sajn-webhook-validator/1.0`). Answering `400` JSON passes; a `404`, redirect, or `2xx` HTML page fails the save.

## How Do I Debug sajn Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails and `X-Sajn-Signature` is present | Endpoint is on API version 2026-09. Move it to 2026-10 and rotate the secret |
| Every request fails | Wrong endpoint's secret, `whsec_` prefix not stripped or key not base64-decoded, or the body was parsed before verification |
| Fails only after a while in production | Server clock drift (timestamp window) |
| Hookdeck retries or replays fail, first deliveries pass | Library's fixed 5-minute window; use the manual verifier with `null` tolerance |
| Fails right after rotating | `SAJN_WEBHOOK_SECRET` still holds the old value. Fix within 24 hours while both signatures are sent |
| Missing headers | A proxy stripped `webhook-*` headers, or the request isn't from sajn |

Each attempt (status code, response, request headers) is in **Inställningar > Utvecklare > Loggar** and `GET /api/v1/webhooks/{id}/deliveries`. Send a signed test with `POST /api/v1/webhooks/{id}/test`.
