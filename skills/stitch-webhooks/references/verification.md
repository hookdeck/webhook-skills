# How to Verify Stitch Webhook Signatures

## How Does Stitch Sign Webhooks?

Stitch delivers webhooks via Svix. Each request has:

| Header | Value |
|--------|-------|
| `svix-id` | Unique message ID |
| `svix-timestamp` | Unix timestamp (seconds) |
| `svix-signature` | Space-delimited `version,signature` entries, e.g. `v1,bm9ldHUj... v2,MzJsNDk4...` |

Signature algorithm:

1. Signed content: `${svix_id}.${svix_timestamp}.${body}` where `body` is the
   **raw, unmodified** request body.
2. Key: base64-decode the part of the signing secret **after** `whsec_`.
3. HMAC-SHA256 the signed content with that key, then base64-encode it.
4. Compare against each `v1,` entry in `svix-signature` (constant time).
   Usually there is one entry; there are several during secret rotation.

## SDK Verification (recommended)

Stitch's docs recommend the official Svix libraries. They check the signature,
reject timestamps more than 5 minutes from now, handle multiple signatures,
and compare in constant time.

### Node.js (`svix`)

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only

const wh = new Webhook(process.env.STITCH_WEBHOOK_SECRET);
try {
  wh.verify(rawBody, {
    'svix-id': req.headers['svix-id'],
    'svix-timestamp': req.headers['svix-timestamp'],
    'svix-signature': req.headers['svix-signature'],
  });
} catch (err) {
  return res.status(400).json({ error: 'Invalid signature' });
}
// svix 2.x verify() returns undefined; parse after verification succeeds
const event = JSON.parse(rawBody.toString('utf8'));
```

### Python (`svix`)

```python
import json
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["STITCH_WEBHOOK_SECRET"])
try:
    wh.verify(raw_body, {
        "svix-id": headers["svix-id"],
        "svix-timestamp": headers["svix-timestamp"],
        "svix-signature": headers["svix-signature"],
    })
except WebhookVerificationError:
    raise HTTPException(status_code=400, detail="Invalid signature")
event = json.loads(raw_body)
```

## Manual Verification (fallback)

Use this only when you can't use a Svix library.

```javascript
import crypto from 'node:crypto';

function verifyStitchSignature(rawBody, svixId, svixTimestamp, svixSignature, secret) {
  const key = Buffer.from(secret.split('_')[1], 'base64');
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');

  // Only v1 entries are HMAC-SHA256 signatures; ignore other versions.
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
import base64, hashlib, hmac

def verify_stitch_signature(raw_body: bytes, svix_id: str, svix_timestamp: str,
                            svix_signature: str, secret: str) -> bool:
    key = base64.b64decode(secret.split("_", 1)[1])
    signed_content = f"{svix_id}.{svix_timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed_content, hashlib.sha256).digest()).decode()
    for entry in svix_signature.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig, expected):
            return True
    return False
```

If you verify manually, also reject stale timestamps yourself (the Svix
libraries use a 5-minute tolerance) to limit replay attacks.

## Common Gotchas

- **Raw body:** parse JSON only after verification. Re-serializing changes
  whitespace and breaks the signature. In Express use `express.raw()`; in
  Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Secret decoding:** the HMAC key is the base64-decoded bytes after `whsec_`,
  not the literal secret string.
- **Several signatures:** `svix-signature` may contain several entries, and
  Stitch's docs show a `v2` entry next to `v1`. Don't compare against the whole
  header or only the first entry.
- **One secret per subscription:** if you have several subscriptions (for
  example per environment), each has its own secret.
- **Clock skew:** the SDKs reject timestamps more than 5 minutes off. Keep the
  server clock in sync (NTP).
- **Legacy webhooks:** the older non-Svix Stitch webhooks don't send `svix-*`
  headers. If headers are missing, check you're on a Svix subscription.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `Missing required webhook headers` | Request isn't from Svix (legacy webhook, manual curl), or a proxy strips headers |
| `No matching signature found` | Wrong secret (another subscription or environment), parsed body, or wrong key decoding |
| `Message timestamp too old` / `too new` | Server clock drift, or replaying an old captured request |
| Works locally, fails in prod | Prod uses a different subscription secret, or middleware parses JSON before your route |

Use the Svix portal's **Logs** to see the exact payload sent, then resend the
message after fixing the handler.
