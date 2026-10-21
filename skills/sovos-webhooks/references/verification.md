# How to Verify Sovos Webhook Signatures

## Why Signature Verification Matters

Your endpoint is a public URL. Sovos's prerequisites require you to verify every
message "using the Svix library or verify the message manually". Verification
proves the notification came from Sovos's Svix app and was not altered.

## How It Works

Sovos delegates signing to Svix. The header names and secret format come from
[Svix's verification guide](https://docs.svix.com/receiving/verifying-payloads/how-manual);
Sovos's own pages do not restate them.

Each request includes three headers:

1. **`svix-id`**: unique message ID (stable across retries)
2. **`svix-timestamp`**: Unix timestamp in **seconds**
3. **`svix-signature`**: one or more space-delimited `v1,<base64 signature>` entries

```
signedContent = `${svix-id}.${svix-timestamp}.${rawBody}`
key           = base64Decode(secret without the "whsec_" prefix)
signature     = base64( HMAC_SHA256(key, signedContent) )
```

The secret (`whsec_...`) comes from the endpoint page in the Svix Consumer App
Portal.

## Implementation

### SDK Verification (recommended: Node and Python)

The official `svix` package exists for Node and Python, so all three examples use
it. It decodes the secret, enforces a 5-minute timestamp window, checks every
signature in constant time, and throws on failure.

> **svix 2.x**: `verify()` validates only and returns nothing. Parse the raw body
> yourself after it passes. The 2.x Node package is ESM-only and needs Node 22+;
> under Jest run `node --experimental-vm-modules node_modules/jest/bin/jest.js`.

Node:

```javascript
import { Webhook } from 'svix';

const wh = new Webhook(process.env.SOVOS_WEBHOOK_SECRET);
wh.verify(rawBody, {
  'svix-id': req.headers['svix-id'],
  'svix-timestamp': req.headers['svix-timestamp'],
  'svix-signature': req.headers['svix-signature'],
});
const notification = JSON.parse(rawBody.toString('utf8'));
```

Python:

```python
import json
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["SOVOS_WEBHOOK_SECRET"])
try:
    wh.verify(body, {                  # body: raw request bytes
        "svix-id": headers["svix-id"],
        "svix-timestamp": headers["svix-timestamp"],
        "svix-signature": headers["svix-signature"],
    })
except WebhookVerificationError:
    ...  # reject with 400

notification = json.loads(body)
```

### Manual Verification (no dependency)

Same computation as the SDK, following Svix's manual guide.

Node:

```javascript
import crypto from 'node:crypto';

function verifySovosWebhook(rawBody, headers, secret, toleranceSec = 300) {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];
  if (!id || !timestamp || !signatureHeader) throw new Error('Missing required webhook headers');

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > toleranceSec) throw new Error('Timestamp too old');

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  // "v1,sigA v1,sigB" -> accept if ANY v1 entry matches (secret rotation)
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
}
```

Python:

```python
import base64, hashlib, hmac
from time import time

def verify_sovos_webhook(body: bytes, headers, secret: str, tolerance_sec: int = 300) -> None:
    msg_id = headers.get("svix-id")
    timestamp = headers.get("svix-timestamp")
    signature_header = headers.get("svix-signature")
    if not all([msg_id, timestamp, signature_header]):
        raise ValueError("Missing required webhook headers")

    if abs(int(time()) - int(timestamp)) > tolerance_sec:
        raise ValueError("Timestamp too old")

    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{timestamp}.".encode() + body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()

    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig, expected):
            return
    raise ValueError("Invalid signature")
```

## Common Gotchas

- **Raw body only.** The signature covers the exact bytes Svix sent. Parsing and
  re-serializing JSON changes key order and whitespace.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`,
  not the literal string.
- **Multiple signatures.** During secret rotation `svix-signature` holds several
  space-delimited entries. Accept if any `v1` entry matches.
- **Timestamp window.** The SDK rejects timestamps more than 5 minutes from your
  clock (past or future). Keep NTP on.
- **`eventType`, not `type`.** Generic Svix examples dispatch on `type`; Sovos
  payloads use a top-level `eventType`.
- **Transformations.** If you enable a Svix transformation in the portal, the
  delivered body is the transformed one. Svix signs what it sends, so verify the
  body you receive.
- **Extra auth is additive.** OAuth, mTLS, or custom headers configured in the
  portal do not replace signature verification.

## Debugging Verification Failures

1. Confirm the body you pass to `verify()` is the raw Buffer/bytes, unparsed.
2. Confirm `svix-id`, `svix-timestamp`, and `svix-signature` are present (framework header names are lowercase).
3. Confirm the secret starts with `whsec_` and belongs to *this* endpoint and environment (test and production have different apps).
4. Check server clock skew is under 5 minutes.
5. Replay a message from the Consumer App Portal's message log, or send a test event from the **Testing** tab.
