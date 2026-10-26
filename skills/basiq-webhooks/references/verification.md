# How to Verify Basiq Webhook Signatures

## How Does Basiq Sign Webhooks?

Basiq signs every webhook with HMAC-SHA256 using the [Standard Webhooks](https://www.standardwebhooks.com/) scheme and a unique key per endpoint. Each request carries three headers:

| Header | Value |
|--------|-------|
| `webhook-id` | Unique message ID, unchanged if the message is resent |
| `webhook-timestamp` | Unix time in seconds |
| `webhook-signature` | Space-separated list of `v1,<base64 signature>` entries |

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{webhook-id}.{webhook-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The request is valid when any `v1,` entry matches. Basiq's docs example secret is `whsec_MA4V6bD7rB0Hcm2aw8ghgDeQ5UAak24DwnX0rX6`, and the key is the base64-decoded `MA4V6bD7rB0Hcm2aw8ghgDeQ5UAak24DwnX0rX6`.

## Why Does Signature Verification Matter?

Your endpoint URL is public, so anyone can POST a fake `consent.revoked` or `connection.invalidated` notification. The thin payload limits the damage (you refetch from Basiq), but an unverified endpoint still lets attackers trigger work. Verify first, then parse.

## Implementation

### Library Verification (recommended)

Basiq has no webhook SDK. Use [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) (npm, PyPI). Both libraries strip `whsec_`, decode the key, tolerate several signature entries and compare in constant time.

```javascript
const { Webhook } = require('standardwebhooks');

// rawBody: the exact request body string, NOT re-serialised JSON
new Webhook(process.env.BASIQ_WEBHOOK_SECRET).verify(
  rawBody,
  {
    'webhook-id': req.get('webhook-id'),
    'webhook-timestamp': req.get('webhook-timestamp'),
    'webhook-signature': req.get('webhook-signature'),
  },
  { jsonParse: false } // return nothing useful; parse the body yourself afterwards
); // throws on a bad signature or a timestamp more than 5 minutes off
```

```python
from standardwebhooks.webhooks import Webhook

Webhook(os.environ["BASIQ_WEBHOOK_SECRET"]).verify(
    await request.body(),
    {
        "webhook-id": request.headers["webhook-id"],
        "webhook-timestamp": request.headers["webhook-timestamp"],
        "webhook-signature": request.headers["webhook-signature"],
    },
    json_parse=False,
)
```

The Python library raises plain `ValueError` or `binascii.Error` (not just `WebhookVerificationError`) on a malformed signature entry, so catch `Exception` and return 400.

### Header Fallback: `webhook-*` or `svix-*`

Hookdeck's Basiq source reads the `webhook-*` headers and falls back to the `svix-*` set (`svix-id`, `svix-timestamp`, `svix-signature`) when `webhook-id` is absent. The examples do the same: pick the prefix, then pass the three values to the library under the `webhook-*` names it expects.

### Manual Verification (no dependency, or a custom timestamp window)

`standardwebhooks` always enforces a fixed 5-minute window. **Hookdeck retries and replays resend the original `webhook-timestamp`**, so a retry that arrives more than 5 minutes after the original attempt fails the library check even though the signature is genuine. Use this verifier where you need to drop or widen the window. Pass `toleranceSeconds = null` to skip the check.

```javascript
const crypto = require('crypto');

function verifyBasiqManual(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = 300) {
  if (!id || !timestamp || !signatureHeader || !secret.startsWith('whsec_')) return false;
  if (!/^[1-9][0-9]*$/.test(timestamp)) return false; // plain positive integer
  if (toleranceSeconds !== null && Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${timestamp}.`).update(rawBody).digest();
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

def verify_basiq_manual(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
                        secret: str, tolerance_seconds=300) -> bool:
    if not (msg_id and timestamp and signature_header and secret.startswith("whsec_")):
        return False
    if not re.fullmatch(r"[1-9][0-9]*", timestamp):  # plain positive integer
        return False
    if tolerance_seconds is not None and abs(time.time() - int(timestamp)) > tolerance_seconds:
        return False
    key = base64.b64decode(secret[len("whsec_"):])
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

Other versions (for example `v1a`) are ignored.

## Common Gotchas

- **Raw body.** The HMAC covers the exact bytes Basiq sent. Use `express.raw({ type: '*/*' })`, `await request.text()` or `await request.body()`. Parsing and re-serialising JSON changes whitespace and key order.
- **Decode the secret.** The key is the base64-decoded part after `whsec_`, not the literal string. Keep the `whsec_` prefix in `BASIQ_WEBHOOK_SECRET`.
- **One secret per subscription.** Each endpoint has its own secret.
- **Multiple signatures.** `webhook-signature` can hold several space-separated entries. Accept the request if any `v1,` entry matches.
- **Clock and replays.** Basiq's own libraries reject timestamps more than five minutes from the current time, and it recommends NTP. Late Hookdeck retries and replays need the manual verifier above.
- **Header prefix.** Read `webhook-*`, and fall back to `svix-*` when `webhook-id` is missing.

## How Do I Debug Basiq Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong subscription's secret, `whsec_` stripped from the env var, or the body was parsed before verification |
| Fails only on retries or replays | The 5-minute window. Use the manual verifier with a wider or no window |
| Fails only after a while in production | Server clock drift |
| Missing headers | A proxy removed `webhook-*` headers, or the request isn't from Basiq |

You can list what Basiq sent with `GET /notifications/webhooks/{webhookId}/messages` and compare it with what your server received.
