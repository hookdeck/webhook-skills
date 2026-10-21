# How to Verify Vanta Webhook Signatures

## How Does Vanta Sign Webhooks?

Vanta's webhooks are powered by Svix. Each request includes:

| Header | Contents |
|--------|----------|
| `svix-id` | Unique message ID (also your idempotency key) |
| `svix-timestamp` | Attempt time, Unix seconds |
| `svix-signature` | Space-delimited list of `v1,<base64 signature>` entries |

The algorithm:

1. Build the signed content: `{svix-id}.{svix-timestamp}.{raw body}`.
2. Strip the `whsec_` prefix from the signing secret and base64-decode the rest.
3. Compute HMAC-SHA256 of the signed content with the decoded key.
4. Base64-encode the digest.
5. Compare it (constant time) against each `v1,` entry in `svix-signature`. Any match
   passes. Several entries appear during secret rotation.
6. Reject timestamps more than 5 minutes from now (Vanta's replay guidance).

## SDK Verification (recommended)

Vanta recommends the official Svix libraries (`svix` on npm and PyPI).

### Node.js

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only

const wh = new Webhook(process.env.VANTA_WEBHOOK_SECRET);
wh.verify(rawBody, {
  'svix-id': req.headers['svix-id'],
  'svix-timestamp': req.headers['svix-timestamp'],
  'svix-signature': req.headers['svix-signature'],
});
// svix 2.x verify() returns undefined; parse rawBody yourself afterwards.
```

### Python

```python
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["VANTA_WEBHOOK_SECRET"])
try:
    wh.verify(raw_body, {
        "svix-id": headers["svix-id"],
        "svix-timestamp": headers["svix-timestamp"],
        "svix-signature": headers["svix-signature"],
    })
except WebhookVerificationError:
    ...  # return 400
```

## Manual Verification (no SDK)

```javascript
import crypto from 'node:crypto';

function verifyVanta(rawBody, svixId, svixTimestamp, svixSignature, secret) {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(svixTimestamp)) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${svixId}.${svixTimestamp}.${rawBody}`)
    .digest('base64');

  return svixSignature.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
```

```python
import base64, hashlib, hmac, time

def verify_vanta(raw_body: bytes, svix_id: str, svix_timestamp: str, svix_signature: str, secret: str) -> bool:
    if abs(int(time.time()) - int(svix_timestamp)) > 300:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{svix_id}.{svix_timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    for entry in svix_signature.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig, expected):
            return True
    return False
```

## Common Gotchas

- **Raw body only.** Parsing JSON and re-serializing changes whitespace and key order.
  Use `express.raw()`, `await request.text()` (Next.js), or `await request.body()` (FastAPI).
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not
  the literal string.
- **Multiple signatures.** Split `svix-signature` on spaces and accept any matching
  `v1,` entry. Don't compare the whole header.
- **Timestamp window.** The SDK rejects timestamps more than 5 minutes off. Check your
  server clock if valid requests fail with a timestamp error.
- **One secret per endpoint.** A secret from a different endpoint won't verify.
- **CSRF middleware** must be disabled on the webhook route.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "Invalid signature" | Wrong secret, or body was parsed/re-serialized before verification |
| Fails only after deploys or proxies | A proxy or middleware rewrote the body or stripped headers |
| "Timestamp too old" / "too new" | Server clock drift, or replaying an old captured request |
| Missing headers | Something in front of your app dropped `svix-*` headers |

Use **Settings → Webhooks → endpoint → Testing → Send Example** to send a correctly
signed request while debugging.
