# How to Verify Fathom Webhook Signatures

## How Does Fathom Sign Webhooks?

Fathom uses the [Standard Webhooks](https://www.standardwebhooks.com/) scheme
(the SDKs use the `svix` library under the hood). Each request includes:

| Header | Value |
|--------|-------|
| `webhook-id` | Unique message ID, e.g. `msg_2x2zwLOcWaRTzsLK8KtbQt1FTk9`. Same value on retries |
| `webhook-timestamp` | Unix timestamp in **seconds** |
| `webhook-signature` | Space-delimited list of `<version>,<base64 signature>`, e.g. `v1,BKQR1BIF...=` |

Algorithm:

1. Signed content: `{webhook-id}.{webhook-timestamp}.{raw body}`
2. Key: base64-decode the part of the secret after `whsec_`
3. Signature: `base64(HMAC-SHA256(key, signed content))`
4. Strip the `v1,` prefix from each entry in `webhook-signature` and compare
   with a constant-time comparison. Any match is valid.
5. Reject timestamps outside your tolerance. Fathom suggests 5 minutes.

## SDK Verification (Recommended)

Both official SDKs expose a static helper that verifies the signature and the
5-minute timestamp window, **throws** on failure, and returns the parsed JSON body.
Fathom marks the SDKs as beta and recommends pinning an exact version.

### TypeScript / Node.js (`fathom-typescript`)

```typescript
import { Fathom } from 'fathom-typescript';

// headers: object with lowercase webhook-id / webhook-timestamp / webhook-signature
// rawBody: string or Buffer, exactly as received
try {
  const meeting = Fathom.verifyWebhook(process.env.FATHOM_WEBHOOK_SECRET!, headers, rawBody);
} catch (err) {
  // invalid signature, missing headers, or timestamp too old/new -> respond 400
}
```

### Python (`fathom-python`)

```python
from fathom_python import Fathom

try:
    meeting = Fathom.verify_webhook(secret, headers, raw_body.decode("utf-8"))
except Exception:
    ...  # respond 400
```

Argument order is `(secret, headers, body)` in both SDKs. This differs from
`svix`/`standardwebhooks`, where `verify()` takes `(body, headers)`.

## Manual Verification

Use this if you can't add the SDK dependency. This version is the same algorithm
as Fathom's documented example, with a length-safe compare.

### Node.js

```javascript
const crypto = require('crypto');

function verifyFathomWebhook(secret, headers, rawBody) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader) return false;

  if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10)) > 300) return false;

  const key = Buffer.from(secret.split('_')[1], 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  return signatureHeader.split(' ').some((entry) => {
    const sig = entry.split(',')[1] ?? entry;
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false; // different lengths
    }
  });
}
```

### Python

```python
import base64, hashlib, hmac, time

def verify_fathom_webhook(secret: str, headers, raw_body: bytes) -> bool:
    webhook_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    signature_header = headers.get("webhook-signature")
    if not (webhook_id and timestamp and signature_header):
        return False

    if abs(int(time.time()) - int(timestamp)) > 300:
        return False

    key = base64.b64decode(secret.split("_")[1])
    signed = f"{webhook_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()

    for entry in signature_header.split(" "):
        sig = entry.split(",", 1)[1] if "," in entry else entry
        if hmac.compare_digest(sig, expected):
            return True
    return False
```

## Common Gotchas

- **Raw body.** Verify the exact bytes received. In Express use
  `express.raw({ type: 'application/json' })` on the route. In Next.js App Router use
  `await request.text()`. In FastAPI use `await request.body()`. Parsing then
  re-stringifying JSON changes whitespace and key order and breaks the signature.
- **Decode the secret.** The HMAC key is the base64-decoded string after `whsec_`, not
  the literal `whsec_...` string and not the undecoded base64 text.
- **Output is base64, not hex.**
- **Strip the version prefix.** Header entries look like `v1,<sig>`. Compare only the
  part after the comma, and check every space-delimited entry.
- **Timestamp is in seconds**, not milliseconds.
- **One secret per webhook.** If you created several webhooks (e.g. per user, or one in
  Settings and one via the API), each delivery is signed with its own webhook's secret.
- **Clock skew.** The SDKs reject timestamps more than 5 minutes from your server's
  clock in either direction. Keep NTP running.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong secret (from a different webhook), or the secret wasn't base64-decoded |
| Fails only in your framework, passes in tests | Body was parsed/re-serialized before verification |
| Fails with "timestamp too old/new" | Server clock skew, or replaying an old captured request |
| Missing headers | A proxy stripped `webhook-*` headers, or the request didn't come from Fathom |
| Works locally, fails in prod | Different `FATHOM_WEBHOOK_SECRET` per environment. Each webhook has its own secret |

To replay a captured request after more than 5 minutes, re-sign it with a fresh
timestamp in a test (as the example test suites do). A stale real delivery is
correctly rejected.
