# How to Verify Nash Webhook Signatures

## How Does Nash Sign Webhooks?

Nash sends webhooks with [Svix](https://www.svix.com/), which signs every request. Nash
recommends the official Svix SDKs and documents manual verification as an alternative.

| Item | Value |
|------|-------|
| Headers | `svix-id`, `svix-timestamp`, `svix-signature` |
| Algorithm | HMAC-SHA256, base64-encoded |
| Signed content | `{svix-id}.{svix-timestamp}.{raw body}` |
| Key | base64-decoded part of the signing secret after `whsec_` |
| Signature header format | Space-delimited `v1,<signature>` entries (several during rotation) |
| Timestamp tolerance | 5 minutes (enforced by the SDK; implement it yourself manually) |

The signing secret is in the Nash Portal under **Settings > Webhook Management > click an
endpoint > Signing Secret**.

## SDK Verification (recommended)

Node.js (`npm install svix`):

```javascript
const { Webhook } = require('svix');

const wh = new Webhook(process.env.NASH_WEBHOOK_SECRET);
// rawBody must be the exact request body. Throws WebhookVerificationError on failure.
wh.verify(rawBody, {
  'svix-id': req.headers['svix-id'],
  'svix-timestamp': req.headers['svix-timestamp'],
  'svix-signature': req.headers['svix-signature'],
});
const payload = JSON.parse(rawBody); // svix 2.x verify() returns nothing
```

Python (`pip install svix`):

```python
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["NASH_WEBHOOK_SECRET"])
wh.verify(raw_body, {
    "svix-id": headers["svix-id"],
    "svix-timestamp": headers["svix-timestamp"],
    "svix-signature": headers["svix-signature"],
})  # raises WebhookVerificationError
payload = json.loads(raw_body)  # svix 2.x verify() returns None
```

## Manual Verification (no SDK)

```javascript
const crypto = require('crypto');

function verifyNashManually(rawBody, headers, secret, toleranceSec = 300) {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatures = headers['svix-signature'];
  if (!id || !timestamp || !signatures) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > toleranceSec) return false;

  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  return signatures.split(' ').some((entry) => {
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

def verify_nash_manually(raw_body: bytes, headers, secret: str, tolerance: int = 300) -> bool:
    msg_id = headers.get("svix-id")
    timestamp = headers.get("svix-timestamp")
    signatures = headers.get("svix-signature")
    if not (msg_id and timestamp and signatures):
        return False
    if abs(int(time.time()) - int(timestamp)) > tolerance:
        return False
    key = base64.b64decode(secret[len("whsec_"):])
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    for entry in signatures.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig, expected):
            return True
    return False
```

## Common Gotchas

- **Raw body.** Verify the exact bytes Nash sent. In Express use `express.raw()` on the
  route (not `express.json()`); in Next.js use `await request.text()`; in FastAPI use
  `await request.body()`. Re-serialized JSON will not match.
- **Decode the secret.** The HMAC key is the base64-decoded string after `whsec_`, not the
  literal secret.
- **Several signatures.** `svix-signature` can carry several space-delimited entries;
  accept the request if any `v1` entry matches.
- **Timestamp tolerance.** The SDK rejects timestamps more than 5 minutes from your clock.
  Keep server time in sync with NTP.
- **Per-endpoint, per-environment secrets.** Each endpoint, and sandbox vs production, has
  its own secret.
- **Header names.** Nash's documented headers are `svix-*`. Node and Starlette lowercase
  incoming header names; `Headers.get()` in Next.js is case-insensitive.
- **svix 2.x is ESM-only.** `require('svix')` works on Node 22.12+, but Jest (and older
  Node) can't load it from CommonJS ("Must use import to load ES Module"). Use
  `const { Webhook } = await import('svix')` instead, as the Express example does.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong secret (other endpoint or environment), or body parsed before verifying |
| Fails only in production | Proxy or middleware rewriting the body, or a different secret |
| "Message timestamp too old" | Clock skew, or replaying an old captured request |
| Missing headers | A proxy stripping `svix-*` headers, or the request isn't from Nash |

Return `400` for a failed verification. Svix retries server errors but only certain 4xx
codes (such as 408, 409 and 429), so fix the cause and replay from the Portal (Webhook
Management > endpoint > Attempts).
