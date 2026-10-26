# How to Verify camelAI Webhook Signatures

## How Does camelAI Sign Webhooks?

camelRun, camelAI's hosted agent runtime, signs every delivery per [Standard Webhooks](https://www.standardwebhooks.com/). Three headers carry the signature:

| Header | Value |
|--------|-------|
| `webhook-id` | The event id (`evt_...`), the same on every retry |
| `webhook-timestamp` | Unix seconds of this delivery attempt |
| `webhook-signature` | One or more space-separated `v1,<base64>` entries |

The signature is computed as:

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The request is valid when any `v1,` entry matches. Entries with other versions (such as `v1a`) are ignored.

Each endpoint has its own `whsec_` secret (up to 16 endpoints). It is returned once when you create the endpoint with `POST /v1/webhooks`. `POST /v1/webhooks/{webhookId}/secret` replaces it, and the old secret keeps signing for 24 hours, so two entries can appear in `webhook-signature` during a rotation.

## Which Header Names Should I Read?

Read `webhook-*`. When `webhook-id` is absent, fall back to the `svix-*` spelling (`svix-id`, `svix-timestamp`, `svix-signature`), which is what Hookdeck does. Then hand the three values to the verifier under the names it expects (`webhook-id`, `webhook-timestamp`, `webhook-signature` for the `standardwebhooks` library).

```javascript
function extractSignatureHeaders(get) {
  const prefix = get('webhook-id') ? 'webhook' : 'svix';
  return {
    id: get(`${prefix}-id`),
    timestamp: get(`${prefix}-timestamp`),
    signature: get(`${prefix}-signature`),
  };
}
```

## Implementation

### Library Verification (recommended)

camelAI doesn't publish its own webhook SDK. Use the Standard Webhooks library ([`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) on npm, [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) on PyPI). It accepts the full `whsec_` secret and returns the parsed payload.

```javascript
const { Webhook } = require('standardwebhooks');

// rawBody: the exact request body string, NOT re-serialised JSON
const sig = extractSignatureHeaders((name) => req.get(name));
const event = new Webhook(process.env.CAMEL_AI_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': sig.id,
  'webhook-timestamp': sig.timestamp,
  'webhook-signature': sig.signature,
}); // throws on a bad signature or a timestamp more than 5 minutes off
```

```python
import os
from standardwebhooks.webhooks import Webhook

prefix = "webhook" if request.headers.get("webhook-id") else "svix"
event = Webhook(os.environ["CAMEL_AI_WEBHOOK_SECRET"]).verify(
    await request.body(),
    {
        "webhook-id": request.headers[f"{prefix}-id"],
        "webhook-timestamp": request.headers[f"{prefix}-timestamp"],
        "webhook-signature": request.headers[f"{prefix}-signature"],
    },
)
```

### Why Do Late Hookdeck Retries Fail the Library Check?

The library always enforces a fixed 5-minute timestamp window. Hookdeck retries and replays resend the **original** `webhook-timestamp`, so a retry or replay that reaches your endpoint more than 5 minutes after the first attempt is rejected, even though the signature is valid. If you receive through Hookdeck, use the manual verifier below, where the window can be dropped or widened. Dedupe on the event `id` instead of relying on a window for replay protection.

### Manual Verification (no timestamp window)

Use this when you receive through Hookdeck, or can't add a dependency. It requires the timestamp to be a plain positive integer, compares **every** space-separated `v1,<base64>` entry in constant time after a length check, and has no freshness window. To widen rather than drop it, add `Math.abs(Date.now() / 1000 - ts) > YOUR_LIMIT`.

```javascript
const crypto = require('crypto');

function verifyCamelAi(rawBody, id, timestamp, signatureHeader, secret) {
  if (!id || !/^[0-9]+$/.test(timestamp || '') || Number(timestamp) <= 0 || !signatureHeader) return false;
  // whsec_ secrets are base64-decoded after the prefix; any other secret is raw UTF-8 bytes
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf8');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  let ok = false;
  for (const entry of signatureHeader.split(' ')) {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) continue;
    const received = Buffer.from(sig, 'base64');
    if (received.length === expected.length && crypto.timingSafeEqual(received, expected)) ok = true;
  }
  return ok;
}
```

```python
import base64, hashlib, hmac

def verify_camel_ai(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str, secret: str) -> bool:
    if not msg_id or not timestamp.isascii() or not timestamp.isdigit() or int(timestamp) <= 0 or not signature_header:
        return False
    key = base64.b64decode(secret[6:]) if secret.startswith("whsec_") else secret.encode()
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = hmac.new(key, signed, hashlib.sha256).digest()
    ok = False
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version != "v1" or not sig:
            continue
        try:
            received = base64.b64decode(sig, validate=True)
        except ValueError:
            continue
        if len(received) == len(expected) and hmac.compare_digest(received, expected):
            ok = True
    return ok
```

## Common Gotchas

- **Raw body.** camelAI's docs say to pass the raw body, before parsing it. Use `express.raw({ type: '*/*' })`, `await request.text()` or `await request.body()`. Parsing and re-serialising JSON changes whitespace and key order.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string. `CAMEL_AI_WEBHOOK_SECRET` holds the full `whsec_` value.
- **One secret per endpoint.** A staging endpoint's secret won't verify production deliveries.
- **Multiple signatures.** During the 24 hours after a secret is replaced, `webhook-signature` can hold several entries. Accept the request if any `v1,` entry matches.
- **Header names.** Read `webhook-*` and fall back to `svix-*`. Libraries that expect `webhook-*` need the values passed under those names.
- **Timestamp window.** The library rejects timestamps more than 5 minutes from your clock. Hookdeck retries and replays keep the original timestamp (see above).
- **Dedupe on `id`.** Delivery is at least once and retries can reorder. Dedupe on `id` (which equals `webhook-id`) and order by `created`.
- **Fail closed.** If `CAMEL_AI_WEBHOOK_SECRET` is unset, reject the request rather than skipping verification.

## How Do I Debug camelAI Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong endpoint's secret, `whsec_` prefix not stripped or key not base64-decoded, or the body was parsed before verification |
| Fails only for retries or replays | The library's 5-minute window and Hookdeck's original timestamp. Use the manual verifier |
| Fails right after replacing the secret | `CAMEL_AI_WEBHOOK_SECRET` still holds the old value. Update it (the old secret signs for 24 hours) |
| Missing headers | A proxy stripped `webhook-*` headers, or the request isn't from camelAI |
| Missing `type` on a payload | The deprecated usage webhook (`PUT /v1/usage-webhook`) is not an envelope and has no `type` |
