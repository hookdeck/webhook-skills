# How to Verify epilot Webhook Signatures

## How Does epilot Sign Webhooks?

epilot follows [Standard Webhooks](https://www.standardwebhooks.com/) and sends two signatures in one header:

| Header | Value |
|--------|-------|
| `webhook-id` | Unique message ID, the same on every retry |
| `webhook-timestamp` | Unix seconds when the request was signed |
| `webhook-signature` | Space-separated: `v1a,<asymmetric> v1,<symmetric>` |

- **`v1a`** (Ed25519) proves the request came from your epilot organization. It's verified with your organization's public key from `https://webhooks.sls.epilot.io/v1/webhooks/.well-known/public-key?orgId=YOUR_ORG_ID`.
- **`v1`** (HMAC-SHA256) proves the request is intended for your webhook. It's verified with the `whsec_...` secret you received when the webhook was created.

Both cover the same content:

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))      # the v1 entry
```

The examples verify `v1` only. The `standardwebhooks` library skips entries with any other version, including `v1a`.

## Library Verification (recommended)

```javascript
const { Webhook } = require('standardwebhooks');

// rawBody: the exact request body string. headers: webhook-id / webhook-timestamp / webhook-signature
new Webhook(process.env.EPILOT_WEBHOOK_SECRET).verify(rawBody, headers, { jsonParse: false });
const event = JSON.parse(rawBody);
```

```python
from standardwebhooks.webhooks import Webhook

Webhook(os.environ["EPILOT_WEBHOOK_SECRET"]).verify(raw_body, headers, json_parse=False)
```

epilot's own docs sample passes only the `v1` entry (`split(" ")[1]`), which assumes `v1a` comes first. Passing the whole header is simpler and doesn't depend on order.

### What if webhook-id is missing?

Read the `webhook-*` headers, and when `webhook-id` is absent fall back to `svix-id`, `svix-timestamp` and `svix-signature`, as Hookdeck does. Then hand the three values to the library under the `webhook-*` names it expects. Every example does this and tests it.

## Manual Verification (no timestamp window, or a wider one)

The library always enforces a fixed 5-minute window. epilot retries (up to 5 hours) and Hookdeck replays resend the original timestamp, so they fail after 5 minutes. This verifier lets you set `windowSeconds` to a larger value or `null` to skip the check. It requires the timestamp to be a plain positive integer, tries every `v1,` entry, skips `v1a`, and compares in constant time after a length check.

```javascript
const crypto = require('crypto');

function verifyEpilot(rawBody, { id, timestamp, signature }, secret, windowSeconds = 300) {
  if (!/^[0-9]+$/.test(timestamp) || Number(timestamp) <= 0) return false;
  if (windowSeconds !== null && Math.abs(Date.now() / 1000 - Number(timestamp)) > windowSeconds) return false;
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signature.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false; // skips v1a (Ed25519) and other versions
    const received = Buffer.from(sig, 'base64');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}
```

```python
import base64, hashlib, hmac, re, time
from typing import Optional


def verify_epilot(raw_body: bytes, msg_id: str, timestamp: str, signature: str, secret: str,
                  window_seconds: Optional[int] = 300) -> bool:
    if not re.fullmatch(r"[0-9]+", timestamp) or int(timestamp) <= 0:
        return False
    if window_seconds is not None and abs(time.time() - int(timestamp)) > window_seconds:
        return False
    key = base64.b64decode(secret[len("whsec_"):]) if secret.startswith("whsec_") else secret.encode()
    expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()
    for entry in signature.split(" "):
        version, _, sig = entry.partition(",")  # skips v1a (Ed25519) and other versions
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

If you drop the window, dedupe on `webhook-id` so a captured request can't be replayed.

## How Do I Verify binary_multipart File Deliveries?

With `deliveryMode: "binary_multipart"` the multipart boundary is random, so the signature can't cover the raw body. epilot signs a string built per file:

```
<sha256_hex_of_file_bytes>.<canonical_metadata_json>
```

`canonical_metadata_json` has the keys `entity_id`, `filename`, `mime_type`, `size_bytes`, `version_index` in alphabetical order. Several files are joined with `\n` in request order. That string takes the place of the raw body in the signed content. `extraFields` scalar parts are not signed. The examples in this skill don't implement it, and Hookdeck's check fails on these deliveries. Prefer `json_base64` when you need verification at the gateway.

## Common Gotchas

- **Use the `whsec_` secret.** Not an API key, Basic or OAuth credential.
- **Raw body.** The HMAC covers the exact bytes epilot sent. Use `express.raw({ type: '*/*' })`, `await request.text()` or `await request.body()`, and parse after verifying.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string.
- **Two entries.** `webhook-signature` always holds a `v1a` entry as well. A handler that only reads the first entry fails.
- **One secret per webhook.** Each config has its own secret.
- **The secret is shown once.** Recreate the webhook if it's lost.
- **Late retries.** The library rejects timestamps more than 5 minutes old. Use the manual verifier for retries and replays.
- **No event ID in the body.** Dedupe on `webhook-id`.

## How Do I Debug epilot Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong webhook's secret, `whsec_` not stripped or key not decoded, or the body was parsed before verification |
| Only retries and replays fail | Timestamp older than the library's 5-minute window |
| Only file deliveries fail | `binary_multipart` mode signs per-file metadata |
| Missing headers | A proxy stripped `webhook-*` headers, or the request isn't from epilot |
| Fails after the webhook was recreated | `EPILOT_WEBHOOK_SECRET` still holds the old secret |
