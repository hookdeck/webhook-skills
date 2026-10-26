# How to Verify Ampersand Webhook Signatures

## Why Signature Verification Matters

A webhook destination URL is public. Verification proves a message came from Ampersand and that the
body was not altered.

## How Does Ampersand Sign Webhooks?

Ampersand delivers through Svix (the Standard Webhooks scheme with `svix-*` headers):

| Header | Content |
|--------|---------|
| `svix-id` | Unique message id (use it as the idempotency key) |
| `svix-timestamp` | Unix time in seconds |
| `svix-signature` | One or more space-separated `v1,<base64>` entries |

```
signedContent = "{svix-id}.{svix-timestamp}.{raw request body}"
key           = base64Decode(secret without the "whsec_" prefix)
signature     = base64( HMAC_SHA256(key, signedContent) )
```

The secret is the destination's Webhook Signing Secret (`whsec_...`). Multiple `v1` entries appear
during secret rotation: accept the message if any one matches.

## Implementation

### Library Verification (recommended: Node and Python)

```javascript
import { Webhook } from 'svix';

new Webhook(process.env.AMPERSAND_WEBHOOK_SECRET).verify(rawBody, {
  'svix-id': headers['svix-id'],
  'svix-timestamp': headers['svix-timestamp'],
  'svix-signature': headers['svix-signature'],
}); // throws WebhookVerificationError; returns undefined as of svix 2.x
const message = JSON.parse(rawBody.toString('utf8'));
```

```python
from svix.webhooks import Webhook, WebhookVerificationError

Webhook(os.environ["AMPERSAND_WEBHOOK_SECRET"]).verify(raw_body, {
    "svix-id": headers["svix-id"],
    "svix-timestamp": headers["svix-timestamp"],
    "svix-signature": headers["svix-signature"],
})  # raises WebhookVerificationError; returns None as of svix 2.x
message = json.loads(raw_body)
```

The library always enforces a fixed 5-minute timestamp window (past or future). The Node package in
svix 2.x is ESM-only.

### Manual Verification (window can be dropped or widened)

Hookdeck retries and replays resend the **original** `svix-timestamp`, so a retry delivered more than
5 minutes later fails the library check even though the signature is valid. Use this verifier when you
receive through Hookdeck or any retrying relay. `toleranceSec = null` disables the window; set a larger
number to widen it.

Node:

```javascript
import crypto from 'node:crypto';

export function verifyAmpersandWebhook(rawBody, headers, secret, toleranceSec = null) {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];
  if (!id || !timestamp || !signatureHeader) throw new Error('Missing required webhook headers');
  // Plain positive integer only (no signs, decimals or whitespace).
  if (!/^[0-9]+$/.test(timestamp) || Number(timestamp) <= 0) throw new Error('Invalid timestamp');
  if (toleranceSec !== null && Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSec) {
    throw new Error('Timestamp too old');
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = Buffer.from(
    crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest('base64')
  );

  // "v1,sigA v1,sigB": compare every v1 entry in constant time, ignore other versions
  let valid = false;
  for (const entry of signatureHeader.split(' ')) {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) continue;
    const candidate = Buffer.from(sig);
    if (candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)) valid = true;
  }
  if (!valid) throw new Error('Invalid signature');
}
```

Python:

```python
import base64, hashlib, hmac, re, time

def verify_ampersand_webhook(body: bytes, headers: dict, secret: str, tolerance_sec=None) -> None:
    msg_id = headers.get("svix-id")
    timestamp = headers.get("svix-timestamp")
    signature_header = headers.get("svix-signature")
    if not (msg_id and timestamp and signature_header):
        raise ValueError("Missing required webhook headers")
    # Plain positive integer only (no signs, decimals or whitespace).
    if not re.fullmatch(r"[0-9]+", timestamp) or int(timestamp) <= 0:
        raise ValueError("Invalid timestamp")
    if tolerance_sec is not None and abs(time.time() - int(timestamp)) > tolerance_sec:
        raise ValueError("Timestamp too old")

    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{timestamp}.".encode() + body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest())

    valid = False
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and sig and hmac.compare_digest(sig.encode(), expected):
            valid = True
    if not valid:
        raise ValueError("Invalid signature")
```

## Common Signature Verification Errors

- **Parsed body.** Re-serialized JSON changes the bytes. Use `express.raw({ type: '*/*' })` (any
  content type), `await request.text()` in Next.js, or `await request.body()` in FastAPI.
- **Using the literal secret as the key.** The key is the base64-decoded part after `whsec_`.
- **Wrong destination's secret.** Each destination, and each dev/prod project, has its own secret.
- **Only checking the first signature.** Check every `v1` entry (rotation).
- **Late retries.** The library rejects timestamps older than 5 minutes; see the manual verifier above.
- **Clock skew.** With the window enabled, keep server time accurate (NTP).

## How to Debug Verification Failures

1. Log the raw body length and confirm it is unparsed bytes.
2. Confirm `svix-id`, `svix-timestamp` and `svix-signature` are present.
3. Confirm `AMPERSAND_WEBHOOK_SECRET` starts with `whsec_` and belongs to this destination.
4. Check that no proxy or middleware modified the body.
5. If only retries fail, the 5-minute window is the cause.

## Security Best Practices

- Use constant-time comparison and verify before parsing.
- Never log the signing secret.
- Return 400 (or 401) for missing headers or a bad signature.
- Deduplicate on `svix-id`.
