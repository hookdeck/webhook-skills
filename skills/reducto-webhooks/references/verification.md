# How to Verify Reducto Webhook Signatures

## Why Signature Verification Matters

Your webhook URL is public. Verifying the Svix signature proves the request came
from Reducto (via Svix), that the body wasn't modified, and that it isn't a
replay of an old message.

## How Does Reducto Sign Webhooks?

Reducto delivers through Svix, so every request has three headers:

| Header | Content |
|--------|---------|
| `svix-id` | Unique message ID (use as idempotency key) |
| `svix-timestamp` | Unix timestamp in seconds |
| `svix-signature` | Space-delimited list of `v1,<base64 signature>` |

The signature is:

```
signedContent = `${svix-id}.${svix-timestamp}.${rawBody}`
key           = base64Decode(secret without the "whsec_" prefix)
signature     = base64( HMAC_SHA256(key, signedContent) )
```

## Implementation

### SDK Verification (recommended — Node and Python)

The official `svix` SDK is available for Node and Python, so all three examples
use it. Reducto's own docs use the same `Webhook.verify` call.

Node (Express / Next.js):

```javascript
import { Webhook } from 'svix';  // svix 2.x is ESM-only

const wh = new Webhook(process.env.REDUCTO_WEBHOOK_SECRET);
wh.verify(rawBody, {
  'svix-id': req.headers['svix-id'],
  'svix-timestamp': req.headers['svix-timestamp'],
  'svix-signature': req.headers['svix-signature'],
}); // throws WebhookVerificationError
const payload = JSON.parse(rawBody.toString('utf8'));
```

Python (FastAPI):

```python
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["REDUCTO_WEBHOOK_SECRET"])
try:
    wh.verify(body, {  # body: raw request bytes
        "svix-id": request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
    })
except WebhookVerificationError:
    ...  # reject with 400
payload = json.loads(body)
```

> **svix 2.x:** `verify()` validates only and returns `undefined`/`None` (1.x
> returned the parsed payload, which is what Reducto's docs show). Parse the raw
> body yourself after verification succeeds. The 2.x Node package is ESM-only and
> needs Node 22+; under Jest run `node --experimental-vm-modules node_modules/jest/bin/jest.js`.

### Manual Verification (fallback)

If you can't use the SDK:

```javascript
import crypto from 'node:crypto';

function verifyReducto(rawBody, headers, secret) {
  const id = headers['svix-id'];
  const ts = headers['svix-timestamp'];
  const sigHeader = headers['svix-signature'];
  if (!id || !ts || !sigHeader) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // 5 min tolerance

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${ts}.${rawBody}`)
    .digest('base64');

  return sigHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
```

## Common Gotchas

- **Raw body.** Pass the exact bytes received. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Secret decoding.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string. The SDK does this for you.
- **Timestamp tolerance.** Messages more than 5 minutes off are rejected. Check server clock drift.
- **Multiple signatures.** During secret rotation `svix-signature` contains several entries; any match is valid.
- **Wrong secret.** Each Svix endpoint has its own secret — use the one for the endpoint receiving the request.
- **No `type` field.** The body is `{status, job_id, metadata}`; don't look for an event envelope.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| `No matching signature found` | Wrong secret, or body was parsed/re-serialized before verifying |
| `Message timestamp too old` / `too new` | Clock skew, or a replayed request |
| Missing headers | A proxy stripped `svix-*` headers, or the request didn't come from Svix |
