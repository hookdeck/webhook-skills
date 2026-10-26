# How to Verify BlindPay Webhook Signatures

## How Does BlindPay Sign Webhooks?

BlindPay delivers webhooks through [Svix](https://www.svix.com/) using the Standard Webhooks scheme with `svix-*` headers:

| Header | Description |
|--------|-------------|
| `svix-id` | Unique message identifier, the same on every retry |
| `svix-timestamp` | Unix timestamp (seconds) when the message was sent |
| `svix-signature` | Space-delimited list of signatures, each `v1,<base64>` |

- **Algorithm:** HMAC-SHA256, base64-encoded
- **Signed content:** `{svix-id}.{svix-timestamp}.{raw body}`
- **Key:** base64-decode the part of the secret after `whsec_`
- **Library timestamp window:** fixed 5 minutes

BlindPay's docs say never to modify the request body before verification.

## Why Does Signature Verification Matter?

Your webhook URL is public. Without verification anyone could POST a fake `payin.complete` and get you to credit an account. Always verify in production.

## SDK Verification (Recommended)

The official `svix` library works for Node.js and Python, so all three examples use it.

### Node.js (`svix` on npm)

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only and needs Node 22+

const wh = new Webhook(process.env.BLINDPAY_WEBHOOK_SECRET); // "whsec_..." accepted as-is
wh.verify(rawBody, {
  'svix-id': req.headers['svix-id'],
  'svix-timestamp': req.headers['svix-timestamp'],
  'svix-signature': req.headers['svix-signature'],
}); // throws WebhookVerificationError; returns nothing
const event = JSON.parse(rawBody.toString('utf8'));
```

- Express: `express.raw({ type: '*/*' })` on the route, then pass `req.body` (a Buffer).
- Next.js App Router: `const rawBody = await request.text()`.

### Python (`svix` on PyPI)

```python
import json
from svix.webhooks import Webhook, WebhookVerificationError

raw_body = await request.body()
try:
    Webhook(secret).verify(raw_body, {
        "svix-id": request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
    })  # returns None; raises WebhookVerificationError on failure
except WebhookVerificationError:
    raise HTTPException(status_code=400, detail="Invalid signature")
event = json.loads(raw_body)
```

In svix 2.x `verify()` no longer returns the parsed payload, so parse the raw body yourself after verification.

## Manual Verification (No Timestamp Window, or a Wider One)

**Hookdeck retries and replays resend the original timestamp**, so the `svix` library rejects a late retry once it is more than 5 minutes old. Use this verifier when you need to accept those, or to debug. It requires the timestamp to be a plain positive integer, checks every `v1,` entry in constant time after a length check, and takes an optional window (`0` = no window).

### Node.js

```javascript
import crypto from 'node:crypto';

export function verifyManually(rawBody, headers, secret, toleranceSeconds = 0) {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];
  if (!id || !timestamp || !signatureHeader || !secret) return false;
  if (!/^[1-9][0-9]*$/.test(timestamp)) return false; // plain positive integer
  if (toleranceSeconds > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) {
    return false;
  }

  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');
  const expected = Buffer.from(
    crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest('base64')
  );

  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const received = Buffer.from(sig);
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}
```

### Python

```python
import base64, hashlib, hmac, re, time

def verify_manually(raw_body: bytes, headers: dict, secret: str, tolerance: int = 0) -> bool:
    msg_id = headers.get("svix-id")
    timestamp = headers.get("svix-timestamp")
    signature_header = headers.get("svix-signature")
    if not (msg_id and timestamp and signature_header and secret):
        return False
    if not re.fullmatch(r"[1-9][0-9]*", timestamp):  # plain positive integer
        return False
    if tolerance > 0 and abs(int(time.time()) - int(timestamp)) > tolerance:
        return False

    key = base64.b64decode(secret.removeprefix("whsec_")) if secret.startswith("whsec_") else secret.encode()
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest())

    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig.encode(), expected):
            return True
    return False
```

## Common Gotchas

- **Raw body.** The HMAC covers the exact bytes BlindPay sent. `express.json()`, `request.json()` or re-serialising with `JSON.stringify` changes whitespace and key order and breaks the signature. Verify first, then parse.
- **Decode the secret.** The key is the base64-decoded bytes after `whsec_`, not the literal `whsec_...` string. The SDK does this for you.
- **Several signatures.** `svix-signature` can carry more than one `v1,` entry (for example during secret rotation). Accept the request if any entry matches. Entries with other versions are ignored.
- **svix 2.x `verify()` returns nothing.** Parse the raw body after verification. svix 2.x for JavaScript is also ESM-only and needs Node 22+.
- **Late retries.** The SDK's fixed 5-minute window rejects retries and Hookdeck replays after that. Use the manual verifier above.
- **Per-endpoint secrets.** Each endpoint has its own `whsec_` secret. A different endpoint's secret fails.
- **Header names.** The Svix library also accepts `webhook-id`, `webhook-timestamp` and `webhook-signature`; BlindPay sends the `svix-*` set.

## How Do I Debug Verification Failures?

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `No matching signature found` | Body parsed or modified before verification | Use the raw body (`express.raw()`, `request.text()`, `await request.body()`) |
| `No matching signature found` with raw body | Wrong endpoint's secret | Fetch it again from the dashboard or `GET .../webhook-endpoints/{we_id}/secret` |
| `Message timestamp too old` | Retry or replay older than 5 minutes | Use the manual verifier with no window |
| `Message timestamp too new` | Server clock ahead | Sync the server clock (NTP) |
| `Missing required headers` | Proxy stripped `svix-*` headers | Pass them through your load balancer |
