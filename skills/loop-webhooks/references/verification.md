# How to Verify Loop Webhook Signatures

## How Does Loop Sign Webhooks?

Loop delivers webhooks through Svix. Every request carries three headers:

| Header | Example | Meaning |
|---|---|---|
| `svix-id` | `msg_p5jXN8AQM9LWM0D4loKWxJek` | Delivery message ID |
| `svix-timestamp` | `1614265330` | Unix time in **seconds** |
| `svix-signature` | `v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=` | One or more space-separated `v1,<base64>` signatures |

The signature is:

```
base64( HMAC-SHA256( key, "{svix-id}.{svix-timestamp}.{raw body}" ) )
key = base64decode( signing secret without the "whsec_" prefix )
```

With the example secret from Loop's docs, `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`,
the id and timestamp above, and the body `{"test": 2432232314}`, the signature
is `g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=`. The example tests check
their signing helper against this value.

Loop uses `svix-*` header names. The same scheme under `webhook-*` names is
Standard Webhooks; the Svix SDK accepts either.

## SDK Verification (Recommended)

Loop's docs point to Svix's libraries.

**Node.js** (`npm install svix`; 2.x is ESM-only, so use `import`):

```javascript
import { Webhook } from 'svix';

const wh = new Webhook(process.env.LOOP_WEBHOOK_SECRET);
try {
  wh.verify(rawBody, {
    'svix-id': req.headers['svix-id'],
    'svix-timestamp': req.headers['svix-timestamp'],
    'svix-signature': req.headers['svix-signature'],
  });
} catch (err) {
  return res.status(400).json({ error: 'Invalid signature' });
}
const event = JSON.parse(rawBody);
```

**Python** (`pip install svix`):

```python
from svix.webhooks import Webhook, WebhookVerificationError

try:
    Webhook(os.environ["LOOP_WEBHOOK_SECRET"]).verify(raw_body, {
        "svix-id": request.headers["svix-id"],
        "svix-timestamp": request.headers["svix-timestamp"],
        "svix-signature": request.headers["svix-signature"],
    })
except WebhookVerificationError:
    raise HTTPException(status_code=400, detail="Invalid signature")
```

The SDK checks every `v1` entry in constant time and rejects timestamps more
than 5 minutes from the current time. Since svix 2.x `verify()` doesn't return
the parsed payload, so parse the raw body yourself after it succeeds.

## Manual Verification

If you can't use the SDK:

```javascript
const crypto = require('crypto');

function verifyLoopWebhook(rawBody, svixId, svixTimestamp, svixSignature, secret) {
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${svixId}.${svixTimestamp}.${rawBody}`)
    .digest('base64');

  return svixSignature.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const a = Buffer.from(sig), b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
```

```python
import base64, hashlib, hmac, time

def verify_loop_webhook(raw_body: bytes, svix_id: str, svix_timestamp: str,
                        svix_signature: str, secret: str) -> bool:
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

- **Raw body.** Loop signs "the raw string body". `JSON.stringify(req.body)`
  or `json.dumps(...)` can produce different bytes. In Express use
  `express.raw()`, in Next.js `await request.text()`, in FastAPI
  `await request.body()`.
- **The secret is base64.** Strip `whsec_` and base64-decode before using it as
  the HMAC key (the SDK does this for you; pass it the full `whsec_` value).
- **Base64, not hex.** Compare against a base64 digest.
- **Several signatures.** During secret rotation the header can hold multiple
  space-separated `v1,` entries. Accept if any one matches.
- **Wrong secret.** Secrets are unique per endpoint. A staging secret won't
  verify production traffic.
- **Timestamp tolerance.** The SDK rejects messages more than 5 minutes old.
  Check server clock drift if valid requests fail with a timestamp error.
- **Dedupe key.** `svix-id` is part of the signature but isn't the dedupe key;
  use the payload `eventId`.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---|---|
| Every request fails | Wrong or truncated secret, or the body was parsed and re-serialized |
| Fails only in production | Using another endpoint's secret |
| `Message timestamp too old` / `too new` | Server clock drift, or replaying an old captured request |
| Fails only for non-ASCII payloads | Body decoded/re-encoded with the wrong charset; hash the bytes as received |
| `Missing required headers` | A proxy stripping `svix-*` headers |

Use the portal's message view to see exactly what Loop sent, and the Hookdeck
CLI's web UI to compare headers and body byte for byte.
