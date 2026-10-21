# How to Verify Sendoso Webhook Signatures

## How Does Sendoso Sign Webhooks?

Sendoso signs every webhook and its metadata with a key that's unique to each endpoint. Delivery runs on Svix, so the scheme is Svix's:

| Header | Description |
|--------|-------------|
| `svix-id` | Unique message identifier. Stays the same across retries |
| `svix-timestamp` | Unix timestamp (seconds) of the delivery attempt |
| `svix-signature` | Space-separated list of `v1,<base64 signature>` entries |

- **Algorithm:** HMAC-SHA256, base64-encoded
- **Signed content:** `{svix-id}.{svix-timestamp}.{raw body}`
- **Key:** the bytes you get by base64-**decoding** the part of the secret after `whsec_`. Sendoso's sample does `Base64.decode64(secret.split('_')[1])`
- **Replay protection:** Sendoso's docs say to reject webhooks whose timestamp is more than **five minutes** away from the current time, past or future

This is the same format as [Standard Webhooks](https://www.standardwebhooks.com/), but with `svix-` header names instead of `webhook-` ones.

## Why Does Signature Verification Matter?

Your endpoint is a public URL. Without verification, anyone can POST a fake `send.redeemed` and trigger your follow-up workflows. The timestamp check stops attackers from replaying a captured, validly signed delivery.

## SDK Verification (Recommended)

Sendoso's docs show manual Ruby code. Because delivery runs on Svix, the official [Svix SDK](https://docs.svix.com/receiving/verifying-payloads/how) verifies Sendoso webhooks directly. It reads `svix-*` headers, enforces the 5-minute tolerance, checks every signature entry, and compares in constant time.

### Node.js (`svix` on npm)

```javascript
import { Webhook } from 'svix';

const wh = new Webhook(process.env.SENDOSO_WEBHOOK_SECRET); // "whsec_..." as copied
wh.verify(rawBody, {                         // rawBody: the exact body string
  'svix-id': req.headers['svix-id'],
  'svix-timestamp': req.headers['svix-timestamp'],
  'svix-signature': req.headers['svix-signature'],
});                                          // throws WebhookVerificationError on failure
const payload = JSON.parse(rawBody);         // only parse after verifying
```

- **svix 2.x changes:** the package is **ESM-only** (`import`, or `require()` on Node 22.12+), and `Webhook.verify()` now returns `undefined` instead of the parsed payload. Parse the body yourself after `verify()` succeeds. Under Jest, run with `node --experimental-vm-modules`.
- Express: use `express.raw({ type: '*/*' })` on the route and pass `req.body.toString('utf8')`.
- Next.js App Router: `const rawBody = await request.text()`.

### Python (`svix` on PyPI)

```python
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["SENDOSO_WEBHOOK_SECRET"])
raw_body = await request.body()
wh.verify(raw_body, {
    "svix-id": request.headers.get("svix-id"),
    "svix-timestamp": request.headers.get("svix-timestamp"),
    "svix-signature": request.headers.get("svix-signature"),
})  # raises WebhookVerificationError; returns None in svix 2.x
payload = json.loads(raw_body)
```

Malformed headers, such as a signature entry without a comma, can raise errors other than `WebhookVerificationError`. Catch `Exception` around `verify()` and return `400`.

## Manual Verification (Reference)

Use this for languages without a Svix SDK, or for debugging.

### Node.js

```javascript
const crypto = require('crypto');

function verifySendosoSignature(rawBody, headers, secret, toleranceSeconds = 300) {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds) return false;

  const key = Buffer.from(secret.split('_')[1], 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
```

### Python

```python
import base64, hashlib, hmac, time

def verify_sendoso_signature(raw_body: bytes, headers, secret: str, tolerance: int = 300) -> bool:
    msg_id = headers.get("svix-id")
    timestamp = headers.get("svix-timestamp")
    signature_header = headers.get("svix-signature")
    if not (msg_id and timestamp and signature_header):
        return False
    try:
        if abs(int(time.time()) - int(timestamp)) > tolerance:
            return False
    except ValueError:
        return False

    key = base64.b64decode(secret.split("_", 1)[1])
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()

    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig, expected):
            return True
    return False
```

## Common Gotchas

- **Not using the raw body.** Sendoso's troubleshooting page calls this the most common issue. `express.json()`, `request.json()`, a Pydantic body model or `JSON.stringify` all change the bytes, so the HMAC won't match. Verify first, then parse.
- **Wrong secret.** Secrets are unique per endpoint. If you have several endpoints, each URL needs its own secret.
- **Using the secret string as the key.** The key is `base64decode(secret after "whsec_")`, not the literal string. The SDK handles this for you.
- **Only checking the first signature.** `svix-signature` can hold several space-separated entries, for example during a secret rotation. Accept the delivery if any `v1` entry matches.
- **Clock skew.** Timestamps more than 5 minutes off are rejected. Keep NTP running.
- **Non-constant-time comparison.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`. Sendoso's Ruby sample uses a constant-time compare too.
- **Fail closed.** If `SENDOSO_WEBHOOK_SECRET` isn't set, return `500` rather than accepting unverified requests.
- **Status codes.** Return `400` (Sendoso's Ruby sample uses `403`) for bad signatures and a `2xx` only when the delivery was handled.

## How to Debug Verification Failures

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Every delivery fails | Wrong endpoint's secret, or the key isn't base64-decoded | Copy the secret from this endpoint's page in the portal |
| Fails after adding middleware | A JSON body parser runs before the webhook route | Use a raw body parser on the webhook route only |
| `Message timestamp too old` / `too new` | Server clock skew, or replaying a captured request | Fix NTP. Re-sign test requests with the current time |
| Missing `svix-*` headers | A proxy or CDN strips them, or the caller isn't Sendoso | Check header forwarding |
| Portal shows failures but your logs show success | Response took more than 15 seconds | Acknowledge right away and process asynchronously |

When debugging locally, `npx hookdeck-cli listen 3000 sendoso --path /webhooks/sendoso` shows the exact headers and body of each delivery. The portal's message view also shows every attempt and its response.
