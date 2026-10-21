# How to Verify WeTravel Webhook Signatures

## Caveat: The Scheme Is Inferred

**WeTravel publishes no signature verification documentation.** Its
[webhooks page](https://developer.wetravel.com/v3/docs/webhooks) covers enabling
webhooks, adding endpoints and the event list, but says nothing about headers or
signing.

What is visible: endpoints are managed in a **Svix App Portal** ("Manage
Webhooks" in WeTravel settings), and each endpoint shows a masked **Signing
Secret**. Svix signs every delivery the same way, so this skill assumes standard
Svix signing. Because that is an inference:

- Accept both `svix-*` headers and the Standard Webhooks `webhook-*` names
  (same algorithm, different header prefix).
- Send a test event before going live and confirm it verifies.
- Log the header names on a failed verification so a scheme change is easy to spot.

## How It Works

Each delivery carries three headers:

| Header | Alias | Value |
|--------|-------|-------|
| `svix-id` | `webhook-id` | Unique message ID (same across retries) |
| `svix-timestamp` | `webhook-timestamp` | Unix timestamp in **seconds** |
| `svix-signature` | `webhook-signature` | Space-separated list of `v1,<base64 signature>` |

The signature is:

```
base64( HMAC-SHA256( key, "{svix-id}.{svix-timestamp}.{raw body}" ) )
```

where `key` is the **base64-decoded** part of the secret after `whsec_`.

## Implementation

### SDK Verification (recommended)

The `svix` package (npm and PyPI) is the official verification library. It
decodes the secret, checks every `v1` signature in constant time, and rejects
timestamps more than 5 minutes from now.

Node (svix 2.x is ESM-only and needs Node 22+):

```javascript
import { Webhook } from 'svix';

const header = (name) => req.headers[`svix-${name}`] ?? req.headers[`webhook-${name}`];

try {
  new Webhook(process.env.WETRAVEL_WEBHOOK_SECRET).verify(rawBody, {
    'svix-id': header('id'),
    'svix-timestamp': header('timestamp'),
    'svix-signature': header('signature'),
  });
} catch (err) {
  return res.status(400).json({ error: 'Invalid signature' });
}
// svix 2.x verify() returns nothing; parse the raw body yourself afterwards.
const event = JSON.parse(rawBody.toString('utf8'));
```

Python:

```python
from svix.webhooks import Webhook, WebhookVerificationError

try:
    Webhook(os.environ["WETRAVEL_WEBHOOK_SECRET"]).verify(raw_body, {
        "svix-id": msg_id,
        "svix-timestamp": timestamp,
        "svix-signature": signature,
    })
except WebhookVerificationError:
    raise HTTPException(status_code=400, detail="Invalid signature")
event = json.loads(raw_body)
```

### Manual Verification (fallback)

Use this only where the `svix` library isn't available (e.g. older Node, or a
language without a Svix SDK):

```javascript
import crypto from 'node:crypto';

function verifyWeTravel(rawBody, id, timestamp, signatureHeader, secret) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest();

  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}
```

```python
import base64, hashlib, hmac, time

def verify_wetravel(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str, secret: str) -> bool:
    try:
        if abs(time.time() - int(timestamp)) > 300:
            return False
    except ValueError:
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

- **Raw body only.** Verify the exact bytes received. `express.json()`,
  `await request.json()` or re-serializing with `JSON.stringify` changes
  whitespace and key order and breaks the signature. Use `express.raw()`,
  `await request.text()`, or `await request.body()`.
- **Decode the secret.** The HMAC key is the base64-decoded string after
  `whsec_`, not the literal `whsec_...` string.
- **Multiple signatures.** During secret rotation `svix-signature` holds several
  space-separated `v1,` entries. Accept the request if any one matches.
- **Timestamp window.** The `svix` library rejects timestamps more than 5
  minutes off, so keep server clocks in sync (NTP). If you replay old
  deliveries through a queue or proxy, verify on first receipt rather than at
  replay time, or the window will reject them.
- **Header prefix.** Accept both `svix-*` and `webhook-*`. Most frameworks
  lowercase header names; FastAPI maps `svix-id` to a `svix_id` parameter.
- **svix 2.x on Node is ESM-only** and requires Node 22+. Use `import`, or
  `await import('svix')` from CommonJS.

## Debugging Verification Failures

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Always "Invalid signature" | Body parsed before verifying | Verify the raw body |
| Always "Invalid signature" | Wrong secret (other endpoint, or rotated) | Copy the Signing Secret for this endpoint from Manage Webhooks |
| "Missing required webhook headers" | Proxy strips headers, or headers arrive with another prefix | Log `Object.keys(req.headers)` and check |
| "Timestamp too old" | Clock skew, or a replayed old delivery | Sync the clock; verify on first receipt |
| Passes locally, fails in production | Middleware ordering (a global JSON parser runs first) | Mount the raw-body route before global body parsers |
