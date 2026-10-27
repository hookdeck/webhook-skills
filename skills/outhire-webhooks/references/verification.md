# How to Verify Outhire Webhook Signatures

## How Does Outhire Sign Webhooks?

Outhire uses [Standard Webhooks](https://www.standardwebhooks.com/). Every delivery carries three headers:

| Header | Value |
|--------|-------|
| `webhook-id` | Unique identifier for this delivery |
| `webhook-timestamp` | Unix timestamp (seconds) of when the request was sent |
| `webhook-signature` | One or more space-separated `v1,<base64 signature>` entries |

The signature is computed as:

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The request is valid when any `v1,` entry matches. Entries with other versions (such as `v1a`) are ignored. Outhire's docs also say to reject timestamps more than 5 minutes from the current time.

## Why Does Signature Verification Matter?

Your endpoint URL is public. Without verification anyone can POST a fake `candidate.stage_changed` and move candidates through your pipeline.

## Implementation

### Library Verification (recommended)

[`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) (npm, PyPI) reads the three headers, checks the timestamp (fixed **5-minute** window), compares in constant time against every `v1,` entry and returns the parsed body. `OUTHIRE_WEBHOOK_SECRET` holds the full `whsec_` value.

Hookdeck also accepts the `svix-id`, `svix-timestamp` and `svix-signature` spelling of the same headers. The examples read `webhook-*` and fall back to `svix-*` when `webhook-id` is absent, then hand the library the values under the `webhook-*` names:

```javascript
const { Webhook } = require('standardwebhooks');

function signatureHeaders(get) {
  const prefix = get('webhook-id') ? 'webhook' : 'svix';
  const id = get(`${prefix}-id`);
  const timestamp = get(`${prefix}-timestamp`);
  const signature = get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) return null; // respond 400
  return { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature };
}

// rawBody: the exact request body string, NOT re-serialised JSON
const event = new Webhook(process.env.OUTHIRE_WEBHOOK_SECRET).verify(rawBody, headers); // throws on failure
```

```python
from standardwebhooks.webhooks import Webhook

event = Webhook(os.environ["OUTHIRE_WEBHOOK_SECRET"]).verify(await request.body(), headers)
```

### Manual Verification (no dependency, adjustable timestamp window)

The library's 5-minute window can't be changed. **Hookdeck retries and replays resend the original timestamp**, so the library rejects a retry that arrives more than 5 minutes after the first attempt. If you receive Outhire webhooks through Hookdeck and want late retries to pass, use this verifier and drop or widen the window (`TOLERANCE_SECONDS`; `None` or `null` disables it):

```javascript
const crypto = require('crypto');

const TOLERANCE_SECONDS = 300; // set to null to accept any age

function verifyOuthire(rawBody, id, timestamp, signatureHeader, secret) {
  if (!/^[1-9][0-9]*$/.test(timestamp)) return false; // plain positive integer
  if (TOLERANCE_SECONDS !== null && Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) {
    return false;
  }
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

TOLERANCE_SECONDS = 300  # set to None to accept any age

def verify_outhire(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str, secret: str) -> bool:
    if not re.fullmatch(r"[1-9][0-9]*", timestamp):  # plain positive integer
        return False
    if TOLERANCE_SECONDS is not None and abs(time.time() - int(timestamp)) > TOLERANCE_SECONDS:
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

Both verifiers use the same `webhook-*` or `svix-*` header selection as above. Without a timestamp window, dedupe on `webhook-id` so a captured request can't be replayed to your handler.

## Common Gotchas

- **Raw body.** The HMAC covers the exact bytes Outhire sent. Use `express.raw({ type: '*/*' })`, `await request.text()` or `await request.body()`. Parsing and re-serialising JSON changes whitespace and key order. Parse only after verifying.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string. Keep the `whsec_` prefix in the env var.
- **One secret per webhook.** A staging webhook's secret won't verify production deliveries.
- **Multiple signatures.** `webhook-signature` can hold several space-separated entries. Accept the request if any `v1,` entry matches.
- **Late Hookdeck retries.** See the manual verifier above.
- **Clock drift.** Keep your server clock in sync with NTP, or timestamps will fail the 5-minute check.
- **No event ID in the body.** Dedupe on `webhook-id`.

## How Do I Debug Outhire Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong webhook's secret, `whsec_` prefix not stripped or key not base64-decoded, or the body was parsed before verification |
| Test ping passes, production events fail | A proxy or middleware is altering larger bodies, or your endpoint takes longer than 10 seconds |
| Fails only on retries | The 5-minute window. Use the manual verifier |
| Fails after a while in production | Server clock drift |
| Missing headers | A proxy stripped `webhook-*` headers, or the request isn't from Outhire |

Check the request and your response in the webhook's delivery log in **Settings > Webhooks**.
