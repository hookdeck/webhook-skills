# How to Verify Uphold Webhook Signatures

## Why Does Signature Verification Matter?

Your webhook URL is public. Without verification, anyone could post a fake `core.transaction.status-changed` with `"status": "completed"` and get you to credit funds that never arrived. Uphold signs every delivery with a key unique to your endpoint, so you can confirm it really came from Uphold and wasn't modified.

## How Does Uphold Sign Webhooks?

Uphold uses Svix's scheme (the same as [Standard Webhooks](https://www.standardwebhooks.com/)), with unbranded header names:

| Header | Content |
|--------|---------|
| `Webhook-Id` | Unique message id. Retries of the same delivery reuse it |
| `Webhook-Timestamp` | Unix timestamp in **seconds** when the delivery was sent |
| `Webhook-Signature` | Space-delimited list, for example `v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4= v1,Ab3...` |

To compute the expected signature:

1. **Key:** take the endpoint secret (`whsec_<base64>`), drop the `whsec_` prefix, and base64-**decode** the remainder to get raw bytes.
2. **Signed content:** `"{Webhook-Id}.{Webhook-Timestamp}.{raw body}"`.
3. **Signature:** `base64(HMAC-SHA256(key, signed content))`.
4. **Compare:** strip the `v1,` prefix from each entry in `Webhook-Signature` and compare each one in constant time. Accept the delivery if any entry matches.
5. **Freshness:** reject timestamps more than 5 minutes from now (the SDK's default) to block replays.

Uphold doesn't publish its own SDK for this. Its docs point to [Svix's verification guide](https://docs.svix.com/receiving/verifying-payloads/why) and Svix's libraries.

## SDK Verification (Recommended)

The `svix` package is available for Node.js and Python. Its `Webhook.verify()` accepts `webhook-*` headers as well as `svix-*`.

### Node.js (Express / Next.js)

```javascript
import { Webhook } from 'svix';

const wh = new Webhook(process.env.UPHOLD_WEBHOOK_SECRET); // full "whsec_..." value

// rawBody must be the exact request bytes (string or Buffer)
wh.verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws WebhookVerificationError on failure

const event = JSON.parse(rawBody); // svix 2.x verify() returns undefined
```

`svix` 2.x is ESM-only. Use `import` (or Node 20.19+ `require(esm)`), and run Jest with `--experimental-vm-modules`, as the Express example does.

### Python (FastAPI)

```python
import json
from svix.webhooks import Webhook, WebhookVerificationError

raw_body = await request.body()
headers = {
    "webhook-id": request.headers.get("webhook-id"),
    "webhook-timestamp": request.headers.get("webhook-timestamp"),
    "webhook-signature": request.headers.get("webhook-signature"),
}
try:
    Webhook(os.environ["UPHOLD_WEBHOOK_SECRET"]).verify(raw_body, headers)
except WebhookVerificationError:
    raise HTTPException(status_code=400, detail="Invalid signature")
event = json.loads(raw_body)  # svix 2.x verify() returns None
```

## Manual Verification (No SDK)

Use this when you can't add the `svix` dependency, or in a language it doesn't support.

```javascript
import crypto from 'node:crypto';

function verifyUpholdSignature(rawBody, headers, secret, toleranceSec = 300) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > toleranceSec) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest();

  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const received = Buffer.from(sig, 'base64');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}
```

```python
import base64, hashlib, hmac, time

def verify_uphold_signature(raw_body: bytes, headers: dict, secret: str, tolerance: int = 300) -> bool:
    msg_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    signature_header = headers.get("webhook-signature")
    if not (msg_id and timestamp and signature_header):
        return False
    if abs(time.time() - int(timestamp)) > tolerance:
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

- **Raw body only.** The HMAC covers the exact bytes Uphold sent. `express.json()`, `request.json()` or a Pydantic model re-serialise the JSON and break the match. Use `express.raw()`, `await request.text()` or `await request.body()`.
- **`webhook-*`, not `svix-*`.** Uphold white-labels Svix, so code copied from a Svix or Clerk example that reads `svix-id` / `svix-signature` finds no headers.
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not the literal string.
- **Several signatures.** `Webhook-Signature` is space-delimited and can hold more than one `v1,` entry (for example during a secret rotation). Check each one rather than comparing the whole header.
- **`svix` 2.x `verify()` returns nothing.** In svix 1.x it returned the parsed payload. In 2.x it returns `undefined` / `None`, so parse the body yourself after verifying.
- **Headers vs payload.** `Webhook-Id`/`Webhook-Timestamp` (Svix delivery) are not the payload's `id`/`createdAt` (Uphold event). Sign with the headers.
- **Environment mismatch.** Sandbox and Production endpoints have different secrets.
- **Timestamp in seconds.** `Webhook-Timestamp` is Unix seconds, not milliseconds.

## How Do I Debug Verification Failures?

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Missing required headers` | Reading `svix-*` headers, or a proxy is stripping headers | Read `webhook-id`, `webhook-timestamp`, `webhook-signature` |
| `No matching signature found` on every delivery | Wrong secret (other endpoint or environment) or the body was parsed first | Copy the secret from this endpoint in this environment; verify the raw body |
| Fails only in production | Middleware (body parser, compression, framework) changes the body before your route | Mount the raw parser on the webhook route only, before any JSON parser |
| `Message timestamp too old` | Server clock drift, or replaying an old captured request | Sync the clock with NTP; generate fresh test signatures |
| Manual check never matches | HMAC keyed with the `whsec_...` string instead of decoded bytes, or hex digest instead of base64 | Base64-decode the key; base64-encode the digest |

Use the Webhooks Portal's delivery logs to see the exact payload and response for each attempt, then redeliver once your fix is deployed.
