# How to Verify Axilio Webhook Signatures

## How Does Axilio Sign Webhooks?

Axilio signs every delivery with the [Standard Webhooks](https://www.standardwebhooks.com) scheme. Each request carries three headers:

| Header | Value |
|--------|-------|
| `webhook-id` | Unique per event, the same value as the body's `id`, stable across retries |
| `webhook-timestamp` | Unix timestamp (seconds) of this delivery attempt |
| `webhook-signature` | Space-separated list of `v1,<base64 signature>` entries |

The signature is computed as:

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The request is valid when any `v1,` entry matches. Entries with other versions (such as `v1a`) are ignored. Each destination has its own `whsec_` secret, shown once when you register it. Axilio documents no other authentication (no API key, Basic auth or IP allowlist).

Hookdeck's Axilio source verifies the same way, and also accepts the `svix-id`, `svix-timestamp` and `svix-signature` headers when the `webhook-*` ones are absent. The examples do the same.

## Why Does Signature Verification Matter?

Your endpoint URL is public. Without verification, anyone can POST a fake `balance.recovered` or `run.completed` event. Payloads carry ids and statuses only, so a forged event can still trigger your follow-up API calls.

## Implementation

### Library Verification (recommended)

Axilio has no webhook SDK of its own and points to any Standard Webhooks library. The examples use [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) (npm, PyPI). It reads `webhook-id`, `webhook-timestamp` and `webhook-signature` and returns the parsed payload.

```javascript
const { Webhook } = require('standardwebhooks');

// rawBody: the exact request body string, NOT re-serialised JSON
const event = new Webhook(process.env.AXILIO_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws on a bad signature or a timestamp more than 5 minutes off
```

```python
from standardwebhooks.webhooks import Webhook

event = Webhook(os.environ["AXILIO_WEBHOOK_SECRET"]).verify(
    await request.body(),
    {
        "webhook-id": request.headers["webhook-id"],
        "webhook-timestamp": request.headers["webhook-timestamp"],
        "webhook-signature": request.headers["webhook-signature"],
    },
)
```

`AXILIO_WEBHOOK_SECRET` holds the full `whsec_...` value. The library strips the prefix and decodes the rest.

### Why Do Hookdeck Retries Fail the Library's Timestamp Check?

The library always rejects a `webhook-timestamp` more than 5 minutes from your clock, and the window can't be changed. Axilio re-signs each of its own retries, but when Hookdeck sits in front of your handler, **Hookdeck retries and replays resend the original request with its original timestamp**. A retry or replay after 5 minutes fails with the library. Hookdeck's own Axilio source applies no timestamp window.

If you receive through Hookdeck, or want a wider window, use the manual verifier below and drop or widen the check.

### Manual Verification (no dependency, adjustable window)

Pass `toleranceSeconds = null` to skip the timestamp window entirely, or a number to widen or narrow it. The timestamp must be a plain positive integer either way.

```javascript
const crypto = require('crypto');

function verifyAxilio(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = 300) {
  if (!id || !signatureHeader || !/^[1-9][0-9]*$/.test(timestamp || '')) return false;
  if (toleranceSeconds !== null && Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) {
    return false;
  }
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest();
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

def verify_axilio(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
                  secret: str, tolerance_seconds: float | None = 300) -> bool:
    if not (msg_id and signature_header and re.fullmatch(r"[1-9][0-9]*", timestamp or "")):
        return False
    if tolerance_seconds is not None and abs(time.time() - int(timestamp)) > tolerance_seconds:
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

Both compare the decoded bytes in constant time after a length check, and try every `v1,` entry.

## Common Gotchas

- **Raw body.** The HMAC covers the exact bytes Axilio sent. Use `express.raw({ type: '*/*' })`, `await request.text()` or `await request.body()`. Parsing and re-serialising JSON changes whitespace and key order. `*/*` makes the raw parser work whatever content type arrives.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string.
- **One secret per destination.** A staging destination's secret won't verify production deliveries.
- **Multiple signatures.** A delivery can carry several space-separated entries. Accept it if any `v1,` entry matches.
- **Fixed 5-minute window in the library.** See above for Hookdeck retries and replays.
- **Fail closed.** If the secret env var is unset, reject the request (the examples return `500`). Never skip verification.
- **Dedupe on `id`.** Delivery is at least once. The body `id` equals `webhook-id` and is stable across retries.

## How Do I Debug Axilio Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong destination's secret, `whsec_` prefix not stripped or key not base64-decoded, or the body was parsed before verification |
| Fails only on retries or replays through Hookdeck | The library's 5-minute window against the original timestamp. Use the manual verifier |
| Fails only after a while in production | Server clock drift |
| Missing headers | A proxy stripped `webhook-*` headers, or the request isn't from Axilio |

Send a test with **Test** on the destination's page. The dashboard's delivery log shows each attempt and its response, and you can replay a failed event once the handler is fixed.
