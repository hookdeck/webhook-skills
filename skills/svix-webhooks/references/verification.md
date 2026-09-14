# How to Verify Svix Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL. Anyone can POST to it. Signature
verification proves the request came from the real sender and that the body was
not altered in transit or replayed. Svix uses HMAC-SHA256 over a message id, a
timestamp, and the raw body.

## How It Works

Each request includes three headers:

1. **`svix-id`** — unique message id (also your idempotency key)
2. **`svix-timestamp`** — Unix timestamp in **seconds**
3. **`svix-signature`** — one or more space-delimited `v1,<base64 signature>` entries

The signature is computed as:

```
signedContent = `${svix-id}.${svix-timestamp}.${rawBody}`
key           = base64Decode(secret without the "whsec_" prefix)
signature     = base64( HMAC_SHA256(key, signedContent) )
```

Notes:

- **Raw body only.** The signature covers the exact received bytes. Verify before
  any JSON parse/re-serialize (which reorders keys and breaks the signature).
- **Base64-decoded key.** The HMAC key is the bytes *after* `whsec_`, base64-decoded — not the literal `whsec_...` string.
- **Timestamp tolerance.** Svix rejects timestamps more than **5 minutes** off (past *or* future) to block replays.
- **Multiple signatures.** During secret rotation Svix sends several `v1,` entries. Accept the message if **any** entry matches; strip the `v1,` prefix before comparing.
- **Header aliases.** Some Standard Webhooks senders use `webhook-id` / `webhook-timestamp` / `webhook-signature`. Same format — accept both.

## Implementation

### SDK Verification (recommended — Node & Python)

The official `svix` SDK exists for both Node and Python, so prefer it in all
frameworks. It decodes the secret, enforces the timestamp window, checks every
signature in constant time, and accepts both header name sets.

> **svix 2.x**: `verify()` validates only — it no longer returns the parsed
> payload (it returned it in 1.x). Parse the raw body yourself after it passes,
> which is the order you want anyway: verify first, parse second. The 2.x Node
> package is also ESM-only and requires Node >= 22; under Jest, run it with
> `node --experimental-vm-modules node_modules/jest/bin/jest.js`.

Node:

```javascript
const { Webhook } = require('svix');

const wh = new Webhook(process.env.SVIX_WEBHOOK_SECRET); // "whsec_..."
wh.verify(rawBody, {                                     // rawBody: raw Buffer/string
  'svix-id': req.headers['svix-id'],
  'svix-timestamp': req.headers['svix-timestamp'],
  'svix-signature': req.headers['svix-signature'],
});
// Throws WebhookVerificationError on failure; returns undefined as of svix 2.x.
const event = JSON.parse(rawBody.toString('utf8'));
```

Python:

```python
import json
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["SVIX_WEBHOOK_SECRET"])
try:
    wh.verify(body, {                  # body: bytes of the raw request body
        "svix-id": headers["svix-id"],
        "svix-timestamp": headers["svix-timestamp"],
        "svix-signature": headers["svix-signature"],
    })
except WebhookVerificationError:
    ...  # reject with 400

event = json.loads(body)               # verify() returns None as of svix 2.x
```

### Manual Verification (fallback / no dependency)

Use this when you cannot add the SDK, or to understand the algorithm. This is the
same computation the SDK performs.

Node:

```javascript
const crypto = require('crypto');

function verifySvixWebhook(rawBody, headers, secret, toleranceSec = 300) {
  const id = headers['svix-id'] || headers['webhook-id'];
  const timestamp = headers['svix-timestamp'] || headers['webhook-timestamp'];
  const signatureHeader = headers['svix-signature'] || headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader) throw new Error('Missing required webhook headers');

  // Reject stale/future timestamps (replay protection)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > toleranceSec) throw new Error('Timestamp too old');

  // key = base64-decoded bytes after the whsec_ prefix
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  // "v1,sigA v1,sigB" -> ["sigA", "sigB"]; accept if ANY matches (rotation)
  const signatures = signatureHeader.split(' ').map(s => s.split(',')[1]);
  const valid = signatures.some(sig => {
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
import hmac, hashlib, base64, json
from time import time

def verify_svix_webhook(body: bytes, headers: dict, secret: str, tolerance_sec: int = 300) -> dict:
    msg_id = headers.get("svix-id") or headers.get("webhook-id")
    timestamp = headers.get("svix-timestamp") or headers.get("webhook-timestamp")
    signature_header = headers.get("svix-signature") or headers.get("webhook-signature")
    if not all([msg_id, timestamp, signature_header]):
        raise ValueError("Missing required webhook headers")

    if abs(int(time()) - int(timestamp)) > tolerance_sec:
        raise ValueError("Timestamp too old")

    key = base64.b64decode(secret.split("_", 1)[1])  # bytes after whsec_
    expected = base64.b64encode(
        hmac.new(key, f"{msg_id}.{timestamp}.{body.decode()}".encode(), hashlib.sha256).digest()
    ).decode()

    signatures = [s.split(",")[1] for s in signature_header.split(" ")]
    if not any(hmac.compare_digest(sig, expected) for sig in signatures):
        raise ValueError("Invalid signature")
    return json.loads(body)
```

## Common Signature Verification Errors

### 1. Raw body required

Verifying against a parsed-then-re-serialized body fails — key order and
whitespace change the bytes. Capture the raw body:

```javascript
// Express — raw middleware on the webhook route
app.post('/webhooks/svix', express.raw({ type: 'application/json' }), handler);
```

```python
# FastAPI — read the raw bytes
body = await request.body()
```

```typescript
// Next.js App Router — read text before parsing
const rawBody = await request.text();
```

### 2. Wrong secret handling

The HMAC key is the base64-decoded bytes after `whsec_`, not the literal string.
The SDK does this for you; if verifying manually, `base64Decode(secret.slice("whsec_".length))`.

### 3. Only checking the first signature

During rotation `svix-signature` holds multiple `v1,` entries. Check them all and
accept if any matches.

### 4. Header casing

HTTP header names are case-insensitive; most frameworks lowercase them. Read
`svix-id`, not `Svix-Id`.

### 5. Clock skew

If your server clock drifts more than 5 minutes, valid webhooks fail the
timestamp check. Keep NTP enabled.

## How to Debug Verification Failures

1. Log the raw body length and confirm it is unparsed bytes.
2. Confirm all three headers are present and lowercase.
3. Confirm the secret starts with `whsec_`.
4. Confirm server time is accurate (within 5 minutes).
5. Use your sender's "Send Example" testing tool to replay a known-good event.

## Security Best Practices

- Always use constant-time comparison (the SDK and `crypto.timingSafeEqual` / `hmac.compare_digest`).
- Validate the timestamp to prevent replays.
- Never log the signing secret.
- Return generic 400 errors — don't leak which check failed to callers.
- Deduplicate on `svix-id` so retried deliveries are processed once.
