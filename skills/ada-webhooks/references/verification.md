# How to Verify Ada Webhook Signatures

## How Does Ada Sign Webhooks?

Ada's docs say each endpoint has a unique signing secret (`whsec_...`) for verifying payloads. Ada delivers webhooks through Svix, which signs every request with three headers:

| Header | Value |
|--------|-------|
| `svix-id` | Unique message ID, the same on every retry of that message |
| `svix-timestamp` | Unix timestamp (seconds) of this delivery attempt |
| `svix-signature` | Space-separated list of `v1,<base64 signature>` entries |

The signature is computed as:

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{svix-id}.{svix-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The request is valid when any `v1,` entry matches. This is the same scheme as [Standard Webhooks](https://www.standardwebhooks.com/); only the header prefix differs (`svix-` instead of `webhook-`).

## Why Does Signature Verification Matter?

Your endpoint URL is public. Without verification, anyone can POST a fake `v1.conversation.ended` or `v1.end_user.updated` event. The timestamp check also limits replay of captured requests.

## Implementation

### Library Verification (recommended)

Ada doesn't publish its own webhook SDK. Use a library for the Svix scheme:

- [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) (npm, PyPI): the Svix-maintained reference implementation, used in this skill's examples. It expects `webhook-*` header names, so map the `svix-*` headers across. It returns the parsed payload.
- [`svix`](https://www.npmjs.com/package/svix) (npm, PyPI): accepts `svix-*` headers directly, but `verify()` returns nothing in v2, so parse the body yourself. Svix v2 on npm is ESM-only and needs Node 22+.

```javascript
const { Webhook } = require('standardwebhooks');

// rawBody: the exact request body string, NOT re-serialised JSON
const event = new Webhook(process.env.ADA_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.get('svix-id'),
  'webhook-timestamp': req.get('svix-timestamp'),
  'webhook-signature': req.get('svix-signature'),
}); // throws on bad signature or a timestamp more than 5 minutes off
```

```python
from standardwebhooks.webhooks import Webhook

event = Webhook(os.environ["ADA_WEBHOOK_SECRET"]).verify(
    await request.body(),
    {
        "webhook-id": request.headers["svix-id"],
        "webhook-timestamp": request.headers["svix-timestamp"],
        "webhook-signature": request.headers["svix-signature"],
    },
)
```

### Manual Verification

Use this if you can't add a dependency:

```javascript
const crypto = require('crypto');

function verifyAda(rawBody, svixId, svixTimestamp, svixSignature, secret) {
  if (Math.abs(Date.now() / 1000 - Number(svixTimestamp)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${svixId}.${svixTimestamp}.${rawBody}`)
    .digest();
  return svixSignature.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const received = Buffer.from(sig, 'base64');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}
```

```python
import base64, hashlib, hmac, time

def verify_ada(raw_body: bytes, svix_id: str, svix_timestamp: str, svix_signature: str, secret: str) -> bool:
    if abs(time.time() - int(svix_timestamp)) > 300:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{svix_id}.{svix_timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    return any(
        version == "v1" and hmac.compare_digest(sig, expected)
        for version, _, sig in (entry.partition(",") for entry in svix_signature.split(" "))
    )
```

## Common Gotchas

- **Raw body.** The HMAC covers the exact bytes Ada sent. Use `express.raw()`, `await request.text()` or `await request.body()`. Parsing and re-serialising JSON changes whitespace and key order.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string.
- **One secret per endpoint.** Each endpoint has its own secret, and a staging endpoint's secret won't verify production deliveries.
- **Multiple signatures.** After a rotation `svix-signature` can hold several space-separated entries. Accept the request if any `v1,` entry matches.
- **Header names.** Ada sends `svix-*` headers, not `webhook-*`. Standard Webhooks libraries need them mapped.
- **Timestamp tolerance.** The libraries reject timestamps more than 5 minutes from your server clock. Keep the clock in sync with NTP. Retries are re-signed with a fresh timestamp, so they still verify.
- **No event ID in the body.** Dedupe on `svix-id`.

## How Do I Debug Ada Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong endpoint's secret, `whsec_` prefix not stripped or key not base64-decoded, or the body was parsed before verification |
| Fails only after a while in production | Server clock drift (timestamp tolerance) |
| Fails right after rotating | `ADA_WEBHOOK_SECRET` still holds the old value. Fetch the new one with `GET /api/v2/webhooks/{id}/secret/` |
| Missing headers | A proxy stripped `svix-*` headers, or the request isn't from Ada |

To compare, check the delivery in the endpoint's **Message Attempts** log in **Config > PLATFORM > Webhooks** and resend it after you fix the handler.
