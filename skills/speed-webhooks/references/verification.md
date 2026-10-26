# How to Verify Speed Webhook Signatures

## How Does Speed Sign Webhooks?

Speed signs every delivery in the [Standard Webhooks](https://www.standardwebhooks.com) layout. Three headers carry the signature:

| Header | Value |
|--------|-------|
| `webhook-id` | The message ID. A retry gets a new one (differs from the body's `evt_…` `id`) |
| `webhook-timestamp` | Unix seconds of this attempt. Each attempt has its own |
| `webhook-signature` | Space-separated list of `v1,<base64 signature>` entries |

The signature is computed as:

```
key       = base64_decode(secret without the "wsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The request is valid when any `v1,` entry matches. Strip the `v1,` prefix before comparing; other versions (such as `v1a`) are ignored. Speed's docs: [Verify signatures](https://apidocs.tryspeed.com/reference/verify-signatures). They call verification optional and show only a Java sample (with typos: unquoted `HmacSHA256`, `:` for `;`, `StandardCharsets,UTF_8`), but the construction above is unambiguous.

## Why Does the Secret Need Changing?

Speed shows the secret as `wsec_<base64>`. The `standardwebhooks` libraries only strip a `whsec_` prefix, so a `wsec_` value would be treated as the key itself and every check would fail. Replace the leading `wsec_` with `whsec_` (or strip it and decode yourself). A value that already starts with `whsec_` works as is.

In a Hookdeck Speed source, do the same when you paste the secret. The configuration alert reads: "Speed shows the secret with a wsec_ prefix. Replace wsec_ with whsec_ when you paste it here, or verification fails."

## Why Does Signature Verification Matter?

Your endpoint URL is public. Without verification anyone can POST a fake `payment.paid` or `withdraw.failed` and make your system ship goods or refund an order.

## Implementation

### Library Verification (recommended)

The examples use [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) (npm) and [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) (PyPI). Both return the parsed payload and reject timestamps more than 5 minutes off.

```javascript
const { Webhook } = require('standardwebhooks');

const secret = process.env.SPEED_WEBHOOK_SECRET.replace(/^wsec_/, 'whsec_');
// rawBody: the exact request body string, NOT re-serialised JSON
const event = new Webhook(secret).verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws on a bad signature or a timestamp more than 5 minutes off
```

```python
import os
from standardwebhooks.webhooks import Webhook

raw = os.environ["SPEED_WEBHOOK_SECRET"]
secret = "whsec_" + raw[len("wsec_"):] if raw.startswith("wsec_") else raw
event = Webhook(secret).verify(
    await request.body(),
    {
        "webhook-id": request.headers["webhook-id"],
        "webhook-timestamp": request.headers["webhook-timestamp"],
        "webhook-signature": request.headers["webhook-signature"],
    },
)
```

**Header fallback.** Apply this before calling `verify()`. The examples read the `webhook-*` headers and, when `webhook-id` is absent, the `svix-*` headers (`svix-id`, `svix-timestamp`, `svix-signature`), exactly as Hookdeck does. They then pass the three values to the library under the `webhook-*` names it expects:

```javascript
const prefix = req.get('webhook-id') ? 'webhook' : 'svix';
const headers = {
  'webhook-id': req.get(`${prefix}-id`),
  'webhook-timestamp': req.get(`${prefix}-timestamp`),
  'webhook-signature': req.get(`${prefix}-signature`),
};
```

### Manual Verification (no dependency, or to change the timestamp window)

The `standardwebhooks` libraries always enforce a fixed **5-minute** timestamp window. **Hookdeck retries and replays resend the original request, including its original `webhook-timestamp`, so the library rejects them once they are more than 5 minutes old.** If you receive Speed webhooks through Hookdeck (or replay deliveries later), use this verifier and set `toleranceSeconds` to `null` (no window) or a wider value.

It accepts the secret in either prefix (`wsec_` or `whsec_`) and, for a secret with neither, uses its raw UTF-8 bytes as the key (as Hookdeck does).

```javascript
const crypto = require('crypto');

// toleranceSeconds: 300 like the library, a larger number to widen it, or null for no window.
function verifySpeed(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = 300) {
  if (!id || !timestamp || !signatureHeader) return false;
  if (!/^[0-9]+$/.test(timestamp) || Number(timestamp) <= 0) return false; // plain positive integer
  if (toleranceSeconds !== null &&
      Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;

  const prefix = ['wsec_', 'whsec_'].find((p) => secret.startsWith(p));
  const key = prefix
    ? Buffer.from(secret.slice(prefix.length), 'base64')
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
def verify_speed(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
                 secret: str, tolerance_seconds: Optional[int] = 300) -> bool:
    if not (msg_id and timestamp and signature_header):
        return False
    if not (timestamp.isascii() and timestamp.isdigit()) or int(timestamp) <= 0:
        return False  # plain positive integer
    if tolerance_seconds is not None and abs(time.time() - int(timestamp)) > tolerance_seconds:
        return False

    prefix = next((p for p in ("wsec_", "whsec_") if secret.startswith(p)), None)
    key = base64.b64decode(secret[len(prefix):]) if prefix else secret.encode("utf-8")
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

- **`wsec_` is not `whsec_`.** Swap the prefix before using the Standard Webhooks library (see above), or strip it and base64-decode the rest yourself.
- **Raw body.** The HMAC covers the exact bytes Speed sent. Use `express.raw({ type: '*/*' })`, `await request.text()` or `await request.body()`. Parsing and re-serialising JSON changes whitespace and key order.
- **Decode the secret.** The HMAC key is the base64-decoded part after the prefix, not the literal string.
- **One secret per endpoint.** Each endpoint has its own `wsec_…` value.
- **Multiple signatures.** `webhook-signature` can hold several space-separated entries. Accept the request if any `v1,` entry matches; ignore other versions.
- **Timestamp window.** The libraries reject timestamps more than 5 minutes from your clock, in either direction. See the manual verifier above for Hookdeck retries and replays.
- **Dedupe.** A retry is re-signed with a new `webhook-id`, so dedupe on the body's top-level `id` (`evt_…`), which stays the same.
- **Queues.** Verify when the request arrives, before queueing: an event that waits more than 5 minutes fails verification in a worker.

## How Do I Debug Speed Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong endpoint's secret, `wsec_` passed to the library unchanged, key not base64-decoded, or the body was parsed before verification |
| Fails only after a while in production | Server clock drift (timestamp window) |
| Hookdeck retries or replays fail, first deliveries pass | Library's fixed 5-minute window; use the manual verifier with `null` tolerance |
| Fails in a Hookdeck Speed source | Secret pasted with `wsec_` instead of `whsec_` |
| Missing headers | A proxy stripped `webhook-*` headers, or the request isn't from Speed |

Speed lets you retry any message manually from the dashboard once you fix the handler.
