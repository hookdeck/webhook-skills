# How to Verify Autumn Webhook Signatures

## How Does Autumn Sign Webhooks?

Autumn delivers through [Svix](https://www.svix.com/). Every request has:

| Header | Description |
|--------|-------------|
| `svix-id` | Unique message identifier, stable across retries |
| `svix-timestamp` | Unix timestamp (seconds) when the message was sent |
| `svix-signature` | Space-delimited list of signatures, each `v1,<base64>` (e.g. `v1,abc123 v1,def456`) |

- **Algorithm:** HMAC-SHA256, base64-encoded
- **Signed content:** `{svix-id}.{svix-timestamp}.{raw body}`
- **Key:** base64-decode the part of the secret after `whsec_`
- **Timestamp window:** the `svix` / `standardwebhooks` libraries always enforce a fixed 5 minutes

## SDK Verification (Recommended)

Autumn's docs recommend the Svix libraries.

### Node.js (`svix` on npm)

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only and needs Node 22+

const wh = new Webhook(process.env.AUTUMN_WEBHOOK_SECRET); // "whsec_..." accepted as-is
wh.verify(rawBody, {
  'svix-id': req.headers['svix-id'],
  'svix-timestamp': req.headers['svix-timestamp'],
  'svix-signature': req.headers['svix-signature'],
}); // throws WebhookVerificationError on failure; returns nothing in svix 2.x
const event = JSON.parse(rawBody.toString('utf8'));
```

- Express: `express.raw({ type: '*/*' })` on the route (any content type verifies), then pass `req.body` (a Buffer).
- Next.js App Router: `const rawBody = await request.text()`.

### Python (`svix` on PyPI)

```python
import json
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["AUTUMN_WEBHOOK_SECRET"])
raw_body = await request.body()
try:
    wh.verify(raw_body, {
        "svix-id": request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
    })  # returns None in svix 2.x; raises WebhookVerificationError on failure
except WebhookVerificationError:
    raise HTTPException(status_code=400, detail="Invalid signature")
event = json.loads(raw_body)
```

## Why Do Retried or Replayed Webhooks Fail With "Message timestamp too old"?

The Svix library rejects any `svix-timestamp` more than 5 minutes from now, with no option to change that. A retry or replay from Hookdeck (or any gateway, queue or replay tool) re-sends the **original** headers, including the original `svix-timestamp`. After 5 minutes the signature is still valid but the library refuses it. So a delivery that failed once and is retried later, or a manual replay from the dashboard, gets a `400`.

Fix: verify manually and choose your own window. Pass `None`/`null` to skip the timestamp check, or a larger number of seconds to widen it. The signature still proves the request came from Autumn; handle replays with idempotency on `svix-id`.

## Manual Verification (Fallback, and the Way to Drop the Window)

Same algorithm the SDK runs. It checks **every** space-separated `v1,<base64>` entry (several appear during secret rotation) in constant time.

### Node.js

```javascript
import crypto from 'node:crypto';

// toleranceSeconds: number to enforce a window, null to disable it
function verifyManually(rawBody, headers, secret, toleranceSeconds = null) {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isInteger(ts)) return false;
  if (toleranceSeconds !== null && Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds) {
    return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = Buffer.from(
    crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest('base64')
  );

  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const candidate = Buffer.from(sig);
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
}
```

### Python

```python
import base64, hashlib, hmac, time
from typing import Optional

def verify_manually(raw_body: bytes, headers: dict, secret: str, tolerance: Optional[int] = None) -> bool:
    msg_id = headers.get("svix-id")
    timestamp = headers.get("svix-timestamp")
    signature_header = headers.get("svix-signature")
    if not (msg_id and timestamp and signature_header):
        return False
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    if tolerance is not None and abs(int(time.time()) - ts) > tolerance:
        return False

    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()

    ok = False
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig.encode(), expected.encode()):
            ok = True
    return ok
```

All three examples call this when `AUTUMN_TIMESTAMP_TOLERANCE_SECONDS` is set (a number, or `off`), and the svix library otherwise.

## Common Gotchas

- **Raw body.** The HMAC covers the exact bytes Autumn sent. `express.json()`, `request.json()` or re-serialising changes whitespace and key order. Use `express.raw({ type: '*/*' })` so every content type reaches the verifier as bytes.
- **Decode the secret.** The key is the base64-decoded bytes after `whsec_`, not the literal string.
- **Several signatures.** Accept the request if any `v1,` entry matches.
- **The secret is shown once.** If it's lost, create a new webhook; `webhooks.get` won't return it.
- **svix 2.x `verify()` returns nothing.** Parse the raw body yourself after verification. svix 2.x for JavaScript is ESM-only and needs Node 22+.
- **Per-webhook secrets.** Each webhook, and each environment (sandbox / live), has its own secret.
- **Dedupe on `svix-id`.** Delivery is at least once.

## How Do I Debug Verification Failures?

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `No matching signature found` | Body parsed or modified before verification | Use the raw body |
| `No matching signature found` with raw body | Wrong secret (another webhook, or sandbox vs live) | Use the secret from that webhook's creation |
| `Message timestamp too old` on a retry or replay | Original timestamp resent after more than 5 minutes | Use the manual verifier with a wider or no window |
| `Message timestamp too old` on first delivery | Server clock skew | Sync the clock (NTP) |
| `Missing required headers` | Proxy stripped `svix-*` headers | Pass them through |
