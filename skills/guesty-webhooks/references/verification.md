# How to Verify Guesty Webhook Signatures

## How It Works

Guesty delivers webhooks through Svix and points to
[Svix's verification instructions](https://docs.svix.com/receiving/verifying-payloads/how-manual).
Every request includes:

| Header | Example | Meaning |
|--------|---------|---------|
| `svix-id` | `msg_2b1c...` | Unique message ID (same across retries; use for dedup) |
| `svix-timestamp` | `1761040000` | Unix seconds when the attempt was signed |
| `svix-signature` | `v1,g0hM9SsE... v1,bm9wZQ==` | Space-separated `version,signature` pairs |

The signature is:

```
base64( HMAC-SHA256( key = base64decode(secret without "whsec_"),
                     message = "{svix-id}.{svix-timestamp}.{raw body}" ) )
```

A request is valid if **any** `v1,` entry matches (multiple entries appear during
secret rotation) and the timestamp is within the tolerance (the Svix SDK uses 5
minutes).

## Implementation

### SDK Verification (recommended — Node.js and Python)

The official `svix` package exists for both Node.js and Python, so all three
examples use it.

Node.js (Express / Next.js):

```javascript
const { Webhook } = require('svix');

const wh = new Webhook(process.env.GUESTY_WEBHOOK_SECRET);
wh.verify(rawBody, {
  'svix-id': headers['svix-id'],
  'svix-timestamp': headers['svix-timestamp'],
  'svix-signature': headers['svix-signature'],
}); // throws WebhookVerificationError
const event = JSON.parse(rawBody.toString('utf8'));
```

Python (FastAPI):

```python
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["GUESTY_WEBHOOK_SECRET"])
wh.verify(raw_body, {
    "svix-id": headers["svix-id"],
    "svix-timestamp": headers["svix-timestamp"],
    "svix-signature": headers["svix-signature"],
})  # raises WebhookVerificationError
event = json.loads(raw_body)
```

In svix 2.x, `verify()` only verifies (returns `undefined` / `None`); parse the
raw body yourself afterwards.

### Manual Verification (no SDK available)

```javascript
const crypto = require('crypto');

function verifyGuestySignature(rawBody, id, timestamp, signatureHeader, secret) {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false; // different lengths
    }
  });
}
```

```python
import base64, hashlib, hmac, time

def verify_guesty_signature(raw_body: bytes, msg_id: str, timestamp: str,
                            signature_header: str, secret: str) -> bool:
    if abs(time.time() - int(timestamp)) > 300:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig, expected):
            return True
    return False
```

## Common Gotchas

- **Raw body:** Use `express.raw()`, `await request.text()` (Next.js), or `await request.body()` (FastAPI). Re-serialized JSON changes whitespace and key order and breaks the signature.
- **Secret decoding:** The HMAC key is the base64-**decoded** part after `whsec_`, not the literal string.
- **Multiple signatures:** `svix-signature` can contain several space-separated entries; accept if any matches.
- **Per-endpoint secrets:** Each subscription URL has its own secret. Fetch it with `GET /webhooks-v2/secret?url=...` for the exact URL you registered.
- **Recreated subscriptions:** Deleting and recreating a subscription can issue a new secret — a sudden wave of failures after a re-subscribe usually means a stale secret.
- **Event field:** Guesty puts the event name in `event`, not Svix's usual `type`.
- **Clock skew:** The SDK rejects timestamps more than 5 minutes off. Keep server clocks in sync (NTP). Each retry is re-signed with a fresh timestamp.

## Debugging Verification Failures

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `No matching signature found` | Wrong secret, parsed body, or secret for a different URL | Re-fetch the secret for the exact URL; verify the raw body |
| `Message timestamp too old` / `too new` | Server clock drift, or replaying a captured request | Sync the clock; re-trigger instead of replaying old captures |
| `Missing required headers` | Proxy stripping `svix-*` headers | Forward all `svix-*` headers unchanged |
| Worked before, fails now | Subscription was recreated | Fetch the new secret and redeploy |
