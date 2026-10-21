# How to Verify Taskrabbit Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL, so anyone can POST to it. Taskrabbit
delivers webhooks through Svix, which signs every payload with a secret unique to
your endpoint. Taskrabbit's docs say to always verify the signature before
processing, and to discard unverified webhooks.

## How It Works

Each request has three headers:

| Header | Contents |
|--------|----------|
| `svix-id` | Unique message ID; the same when a message is retried (use it for idempotency) |
| `svix-timestamp` | Unix timestamp in **seconds** |
| `svix-signature` | One or more space-delimited `v1,<base64 signature>` entries |

Svix accounts that white-label their headers send `webhook-id`,
`webhook-timestamp` and `webhook-signature` instead. The format is identical; the
examples accept both.

The signature is:

```
signedContent = `${svix-id}.${svix-timestamp}.${rawBody}`
key           = base64Decode(secret without the "whsec_" prefix)
signature     = base64( HMAC_SHA256(key, signedContent) )
```

## Implementation

### SDK Verification (recommended: Node and Python)

The official `svix` package exists for Node and Python, so all three examples use
it. It decodes the secret, rejects timestamps more than 5 minutes off, checks
every signature in constant time, and accepts both header name sets.

> **svix 2.x**: `verify()` no longer returns the parsed payload. Parse the raw
> body yourself after it passes. The Node package is ESM-only and needs Node 22+;
> the Express example is an ES module and runs Jest with
> `--experimental-vm-modules`.

Node:

```javascript
import { Webhook } from 'svix';

const wh = new Webhook(process.env.TASKRABBIT_WEBHOOK_SECRET);
wh.verify(rawBody, {
  'svix-id': req.headers['svix-id'],
  'svix-timestamp': req.headers['svix-timestamp'],
  'svix-signature': req.headers['svix-signature'],
}); // throws WebhookVerificationError on failure
const event = JSON.parse(rawBody.toString('utf8'));
```

Python:

```python
import json, os
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["TASKRABBIT_WEBHOOK_SECRET"])
try:
    wh.verify(body, {                  # body: raw request bytes
        "svix-id": headers["svix-id"],
        "svix-timestamp": headers["svix-timestamp"],
        "svix-signature": headers["svix-signature"],
    })
except WebhookVerificationError:
    ...  # respond 400
event = json.loads(body)
```

### Manual Verification (fallback, no dependency)

This is the same computation the SDK performs.

Node:

```javascript
import crypto from 'crypto';

function verifyTaskrabbitWebhook(rawBody, headers, secret, toleranceSec = 300) {
  const id = headers['svix-id'] || headers['webhook-id'];
  const timestamp = headers['svix-timestamp'] || headers['webhook-timestamp'];
  const signatureHeader = headers['svix-signature'] || headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader) throw new Error('Missing required webhook headers');

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > toleranceSec) throw new Error('Timestamp too old');

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  // "v1,sigA v1,sigB" -> accept if ANY matches (secret rotation)
  const valid = signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false; // length mismatch
    }
  });
  if (!valid) throw new Error('Invalid signature');
  return JSON.parse(rawBody);
}
```

Python:

```python
import base64, hashlib, hmac, json
from time import time

def verify_taskrabbit_webhook(body: bytes, headers: dict, secret: str, tolerance_sec: int = 300) -> dict:
    msg_id = headers.get("svix-id") or headers.get("webhook-id")
    timestamp = headers.get("svix-timestamp") or headers.get("webhook-timestamp")
    signature_header = headers.get("svix-signature") or headers.get("webhook-signature")
    if not all([msg_id, timestamp, signature_header]):
        raise ValueError("Missing required webhook headers")

    if abs(int(time()) - int(timestamp)) > tolerance_sec:
        raise ValueError("Timestamp too old")

    key = base64.b64decode(secret.removeprefix("whsec_"))
    expected = base64.b64encode(
        hmac.new(key, f"{msg_id}.{timestamp}.".encode() + body, hashlib.sha256).digest()
    ).decode()

    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig, expected):
            return json.loads(body)
    raise ValueError("Invalid signature")
```

## Common Signature Verification Errors

### 1. Parsing the body before verifying

The signature covers the exact raw bytes. Parsing and re-serializing JSON changes
whitespace and key order, which breaks the signature. Capture the raw body:

```javascript
// Express: raw middleware on the webhook route only
app.post('/webhooks/taskrabbit', express.raw({ type: 'application/json' }), handler);
```

```typescript
// Next.js App Router
const rawBody = await request.text();
```

```python
# FastAPI
body = await request.body()
```

### 2. Using the secret string as the key

The HMAC key is the base64-decoded bytes after `whsec_`, not the literal string.
The SDK handles this.

### 3. Only checking the first signature

During rotation `svix-signature` holds more than one entry. Accept the message if
any `v1` entry matches.

### 4. Clock skew

The SDK rejects timestamps more than 5 minutes from your server's clock. Keep NTP
enabled. A message replayed from the dashboard gets a fresh timestamp and
signature, so replays still verify.

### 5. Reading `type` instead of `event`

Not a signature error, but a common one after verification: Taskrabbit payloads
put the event name in `event`. Code copied from other Svix providers that reads
`payload.type` / `payload.data` silently falls through to the default branch.

## How to Debug Verification Failures

1. Confirm the secret is the one for **this** endpoint in the Svix Partner Dashboard and starts with `whsec_`.
2. Log the raw body length and confirm nothing parsed it first.
3. Confirm all three headers arrive (check proxies that strip unknown headers).
4. Check server time.
5. Replay the message from the dashboard and compare the response your endpoint returned.

## Security Best Practices

- Use constant-time comparison (the SDK, `crypto.timingSafeEqual`, `hmac.compare_digest`).
- Never log the signing secret.
- Return a generic `400` for any verification failure.
- Deduplicate on `svix-id` so retried deliveries are processed once.
