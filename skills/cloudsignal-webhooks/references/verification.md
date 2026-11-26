# CloudSignal Webhook Verification

## How It Works (There Is No Signature)

Most webhook providers sign the payload with an HMAC and put the digest in a
header you recompute and compare. **CloudSignal does not.** There is:

- **no** signature header (no `X-CloudSignal-Signature`, no `X-Cloudprinter-*`),
- **no** HMAC and **no** timestamp,
- and this is **not** Standard Webhooks (`webhook-id` / `webhook-timestamp` /
  `webhook-signature`).

Instead, each POST carries a plaintext, per-endpoint **Webhook API key** in the
JSON body's `apikey` field. Authenticate by comparing that value against the key
you configured (`CLOUDSIGNAL_WEBHOOK_APIKEY`), using a timing-safe comparison.

> **The Webhook API key is different from your account API key.** The account key
> authenticates *your* outbound Print API calls; the Webhook API key is what
> CloudSignal sends *to you* in each signal body. Compare against the Webhook key.

Because there is no signature over the raw bytes, the raw request body is not
security-critical: ordinary JSON parsing is safe, and the `apikey` you
authenticate against lives *inside* the parsed JSON. Do **not** fabricate an HMAC
check — there is nothing to verify against.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  // timingSafeEqual throws on length mismatch — guard first
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// providedKey = body.apikey; expectedKey = CLOUDSIGNAL_WEBHOOK_APIKEY
function verifyApiKey(providedKey, expectedKey) {
  if (!providedKey || !expectedKey) return false;
  return safeEqual(providedKey, expectedKey);
}
```

### Python

```python
import hmac

def verify_api_key(provided_key: str | None, expected_key: str | None) -> bool:
    if not provided_key or not expected_key:
        return False
    return hmac.compare_digest(provided_key, expected_key)
```

Use the result to gate the request: on a mismatch return `401`; on success
process the signal and return `200`/`204`.

## The Official SDK (`@cloudprinter/cloudsignal`)

Cloudprinter publishes a Node SDK, but it is a **standalone HTTP server**, not
middleware you can mount on an existing app:

```javascript
const CloudSignal = require('@cloudprinter/cloudsignal');
const eventHandler = new CloudSignal.EventHandler(webhookApiKey, 8100); // listens on its own port

eventHandler.on('ItemShipped', (signal) => { /* handle */ });
eventHandler.on('error', (err) => { /* log */ });
```

Internally it does exactly `data.apikey === webhookApiKey` and emits the signal
`type` as an event. Because it owns its own `http` server, it **cannot** be used
as an Express, Next.js, or FastAPI route handler. Two consequences:

- For an Express/Next.js/FastAPI app (the examples in this skill), verify
  **manually** with the snippet above so the handler fits your existing routes.
- Its rejection response for a bad key is HTTP **500**; the examples here return
  **401** instead, which is the more conventional "unauthorized" status.
- Its type list (last changed 2020) predates v2.1, so it answers **500** to
  `ItemDeliveryStarted`, `ItemDeliveryCompleted` and `ItemDeliveryFailed`, and
  CloudSignal retries them. Don't subscribe to those signals if you use it.

Use the SDK only if you want a dedicated, standalone Node receiver process.

## Common Gotchas

- **Do not look for a signature header.** There is no HMAC. Authenticity = the
  body `apikey` matching your configured Webhook API key.
- **Webhook API key ≠ account API key.** Compare against the per-endpoint Webhook
  key from the Dashboard.
- **The `apikey` is inside the body**, so you must parse the JSON to read it —
  that parsing *is* the verification step. There is no raw-body signature to
  preserve.
- **Use a timing-safe comparison** (`crypto.timingSafeEqual` / `hmac.compare_digest`)
  and guard against length mismatch, which throws in Node.
- **Return `200`/`204` to acknowledge.** Any other status triggers retries — up
  to 100 attempts over 7 days. Return `401` only for an invalid `apikey`.
- **Signal `type` is case-sensitive PascalCase** (e.g. `ItemShipped`, not
  `item_shipped`).

## Debugging Verification Failures

- **`401` on every request:** confirm `CLOUDSIGNAL_WEBHOOK_APIKEY` exactly matches
  the endpoint's Webhook API key in the Dashboard (watch for trailing whitespace),
  and that you are comparing against `body.apikey`, not a header.
- **Signals never arrive:** confirm the endpoint URL registered in the Dashboard /
  CloudApps API is your public HTTPS URL and reachable.
- **Repeated deliveries of the same signal:** you are not returning `200`/`204`
  fast enough (or at all) — CloudSignal retries any other response, including
  other 2xx codes. Acknowledge
  first, process asynchronously, and deduplicate (see the overview's idempotency
  note).

## Full Documentation

- [CloudSignal Webhooks v2.1](https://docs.cloudprinter.com/client/cloudsignal-webhooks-v2-1)
- [CloudSignal connected app (setup)](https://docs.cloudprinter.com/connected-apps/cloudsignal-webhooks/)
