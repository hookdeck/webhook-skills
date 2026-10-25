# How to Verify SafeBase Webhook Signatures

## How Does SafeBase Sign Webhooks?

SafeBase's webhooks are delivered by Svix (an embedded App Portal). SafeBase's article
doesn't list the header names or secret format; they are Svix defaults:

| Header | Contents |
|--------|----------|
| `svix-id` | Unique message ID (also your idempotency key) |
| `svix-timestamp` | Attempt time, Unix seconds |
| `svix-signature` | Space-separated list of `v1,<base64 signature>` entries |

Because the `svix-` prefix is inferred, the snippets below (like Hookdeck) fall back to
`webhook-id`, `webhook-timestamp` and `webhook-signature`, Svix's other header prefix,
when the `svix-*` headers are absent. The signed content is the same either way.

The algorithm (Standard Webhooks with the `svix` header prefix):

1. Build the signed content: `{svix-id}.{svix-timestamp}.{raw body}`.
2. Strip the `whsec_` prefix from the Signing Secret and base64-decode the rest.
3. Compute HMAC-SHA256 of the signed content with the decoded key.
4. Base64-encode the digest.
5. Compare it in constant time against each `v1,` entry. Any match passes (several
   entries appear during secret rotation).

## SDK Verification (recommended)

### Node.js

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only

const wh = new Webhook(process.env.SAFEBASE_WEBHOOK_SECRET);
wh.verify(rawBody, {
  'svix-id': req.headers['svix-id'] ?? req.headers['webhook-id'],
  'svix-timestamp': req.headers['svix-timestamp'] ?? req.headers['webhook-timestamp'],
  'svix-signature': req.headers['svix-signature'] ?? req.headers['webhook-signature'],
}); // throws on failure; parse rawBody yourself afterwards
```

### Python

```python
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["SAFEBASE_WEBHOOK_SECRET"])
try:
    wh.verify(raw_body, {
        "svix-id": headers.get("svix-id") or headers.get("webhook-id"),
        "svix-timestamp": headers.get("svix-timestamp") or headers.get("webhook-timestamp"),
        "svix-signature": headers.get("svix-signature") or headers.get("webhook-signature"),
    })
except WebhookVerificationError:
    ...  # return 400
```

The library always enforces a fixed 5-minute timestamp window. See the next section if
that is a problem.

## Why Do Hookdeck Retries and Replays Fail the 5-Minute Window?

Hookdeck retries and replays resend the **original** `svix-timestamp`. After 5 minutes
the `svix` library rejects them as too old, even though the signature is valid. If your
endpoint receives deliveries through Hookdeck, or from any queue that may deliver late,
use the manual verifier below and pass `null`/`None` as the tolerance (no window)
or a larger value.

## Manual Verification (no SDK, configurable window)

```javascript
import crypto from 'node:crypto';

// toleranceSeconds: null = no timestamp window
// Pass req.headers['svix-id'] ?? req.headers['webhook-id'] (and the same for timestamp
// and signature), and return 400 first if any of the three is missing.
function verifySafeBase(rawBody, svixId, svixTimestamp, svixSignature, secret, toleranceSeconds = null) {
  if (!/^[1-9][0-9]*$/.test(svixTimestamp)) return false; // plain positive integer
  if (toleranceSeconds !== null) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(svixTimestamp)) > toleranceSeconds) return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${svixId}.${svixTimestamp}.`)
    .update(rawBody) // Buffer or string, exactly as received
    .digest();

  return svixSignature.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const received = Buffer.from(sig, 'base64');
    return received.toString('base64') === sig && received.length === expected.length &&
      crypto.timingSafeEqual(received, expected); // canonical base64 only
  });
}
```

```python
import base64, hashlib, hmac, re, time

# Pass headers.get("svix-id") or headers.get("webhook-id") (and the same for timestamp
# and signature), and return 400 first if any of the three is missing.
def verify_safebase(raw_body: bytes, svix_id: str, svix_timestamp: str, svix_signature: str,
                    secret: str, tolerance_seconds=None) -> bool:
    if not re.fullmatch(r"[1-9][0-9]*", svix_timestamp):  # plain positive integer
        return False
    if tolerance_seconds is not None and abs(int(time.time()) - int(svix_timestamp)) > tolerance_seconds:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{svix_id}.{svix_timestamp}.".encode() + raw_body
    expected = hmac.new(key, signed, hashlib.sha256).digest()
    for entry in svix_signature.split(" "):
        version, _, sig = entry.partition(",")
        if version != "v1" or not sig:
            continue
        try:
            received = base64.b64decode(sig, validate=True)
        except ValueError:
            continue
        if hmac.compare_digest(received, expected):
            return True
    return False
```

## Common Gotchas

- **Raw body only.** Parsing JSON and re-serializing changes whitespace and key order.
  Use `express.raw({ type: '*/*' })`, `await request.text()` (Next.js), or
  `await request.body()` (FastAPI).
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not
  the literal string.
- **Paste the secret as shown.** Paste the endpoint's Signing Secret from the SafeBase
  webhook portal exactly as shown, including any whsec_ prefix.
- **Multiple signatures.** Split `svix-signature` on spaces and accept any matching
  `v1,` entry.
- **One secret per endpoint.** A secret from a different endpoint won't verify.
- **Late retries.** The SDK's fixed 5-minute window rejects Hookdeck retries and replays.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "Invalid signature" | Wrong or truncated secret, or the body was parsed/re-serialized first |
| Fails only behind a proxy | The proxy rewrote the body or stripped the `svix-*` (or `webhook-*`) headers |
| "Timestamp too old" on retries/replays | Fixed 5-minute window; use the manual verifier |
| Missing headers | Something in front of your app dropped the headers |

Use the **Testing** tab in the SafeBase webhook portal to send a correctly signed
request while debugging.
