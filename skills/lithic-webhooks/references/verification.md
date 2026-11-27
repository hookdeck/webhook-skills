# How to Verify Lithic Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is public. Without verification, anyone could POST forged
card or payment events to it. Verifying the signature proves the request came
from Lithic and that the body was not tampered with in transit.

## How It Works

Lithic signs webhooks with the [Standard Webhooks](https://www.standardwebhooks.com/)
layout. Each delivery includes three headers:

| Header | Meaning |
|--------|---------|
| `webhook-id` | Message id: the event token, unchanged when the message is resent |
| `webhook-timestamp` | Unix seconds of this delivery attempt |
| `webhook-signature` | Space-delimited list of `v1,<base64sig>` values |

The signature is computed as:

```
signedContent = `${webhook-id}.${webhook-timestamp}.${rawBody}`
key           = base64Decode(secret without the "whsec_" prefix)
signature     = base64( HMAC_SHA256(key, signedContent) )
```

Lithic leaves the timestamp tolerance to you; its example code and the SDKs
reject a `webhook-timestamp` more than **5 minutes** from your clock. Multiple
signatures may appear (space separated) after a secret rotation, and a match
against any one is valid.

Lithic's docs include a test vector: webhook-id `65a9dad4-1b60-4686-83fd-65b25078a4b4`,
timestamp `1698031907`, secret `aDeFC3Zn55XB3PDD2zF0JP9cyrDHdV/18VOmkTcuyto=`
(already without `whsec_`) and body
`{"acquirer_fee":0,"amount":2000,"authorization_amount":2000}` give
`OGBiqPtc/O2sWacUsuS4pvTdfFBv6dqxYX/4UFzrbGk=`.

## Implementation

### SDK Verification (recommended)

The official Lithic SDKs verify **and** parse in one call:
`webhooks.unwrap(rawBody, headers, secret)`. It throws when the signature is
invalid or the timestamp is outside tolerance.

**Node (Express / Next.js):**

```javascript
const Lithic = require('lithic');
const lithic = new Lithic({ apiKey: process.env.LITHIC_API_KEY });

// rawBody must be the exact bytes received (string). Never verify parsed JSON.
const event = lithic.webhooks.unwrap(
  rawBody,
  headers,                          // req.headers or Object.fromEntries(request.headers)
  process.env.LITHIC_WEBHOOK_SECRET
);
// event.event_type plus the resource's fields (a flat body, no envelope)
```

**Python (FastAPI):**

```python
from lithic import Lithic
client = Lithic(api_key=os.environ["LITHIC_API_KEY"])

event = client.webhooks.unwrap(
    raw_body,                 # bytes/str of the raw request body
    request.headers,          # Starlette headers (a Mapping)
    secret=os.environ["LITHIC_WEBHOOK_SECRET"],
)
```

Install the verification extra: `pip install "lithic[webhooks]"` (pulls in the
`standardwebhooks` package). `client.webhooks.verify_signature(...)` verifies
without parsing if you only need a boolean-style check.

### Manual Verification (fallback)

If you cannot use the SDK, replicate the algorithm. This is exactly what the SDK
does internally:

```javascript
const crypto = require('crypto');

function verifyLithicSignature(rawBody, headers, secret) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const sigHeader = headers['webhook-signature'];
  if (!id || !timestamp || !sigHeader) return false;

  // Reject stale timestamps (5-minute tolerance).
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  // The header is a space-delimited list of "v1,<sig>" entries.
  return sigHeader.split(' ').some((part) => {
    const sig = part.split(',')[1] || part;
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false; // length mismatch
    }
  });
}
```

## Common Gotchas

- **Use the raw body.** Verify against the exact bytes received. In Express use
  `express.raw({ type: 'application/json' })`; in Next.js use `await request.text()`;
  in FastAPI use `await request.body()`. Re-serialized JSON will not match.
- **Base64-decode the secret.** The HMAC key is the base64 decode of the part
  after `whsec_`, not the literal string. The SDK does this for you.
- **Header casing.** HTTP header names are case-insensitive; most frameworks
  lowercase them (`webhook-id`). The SDK normalizes casing.
- **Timestamp tolerance.** The SDK rejects deliveries more than 5 minutes from
  your clock, so keep your server clock accurate (NTP). Each retry carries a new
  timestamp.
- **Signature is a list.** During secret rotation the header can carry multiple
  space-separated `v1,<sig>` values; accept a match against any one.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Always fails | Verifying parsed JSON instead of the raw body |
| Fails after a proxy/gateway | Body re-encoded or headers stripped upstream |
| Intermittent failures | Server clock drift beyond the 5-minute tolerance |
| Fails only in Python | `standardwebhooks` not installed (`pip install "lithic[webhooks]"`) |
| Fails right after rotating | Old secret still deployed; the previous secret is only valid for 24 hours |

Return **HTTP 400** on verification failure and **200** once processed. Lithic
treats a non-200 response as a failed attempt and retries it.
