# How to Verify Airweave Webhook Signatures

## How Does Airweave Sign Webhooks?

Airweave delivers webhooks through [Svix](https://www.svix.com/), which signs every delivery with the Standard Webhooks scheme. Every request has three headers:

| Header | Description |
|--------|-------------|
| `svix-id` | Unique message identifier. Same on every retry of the message to one subscription |
| `svix-timestamp` | Unix timestamp (seconds) of the delivery attempt |
| `svix-signature` | Space-delimited list of signatures, each `v1,<base64>` (e.g. `v1,abc123 v1,def456`) |

- **Algorithm:** HMAC-SHA256, base64-encoded
- **Signed content:** `{svix-id}.{svix-timestamp}.{raw body}`
- **Key:** base64-decode the part of the secret after `whsec_`
- **Secret:** the `secret` field from `GET /webhooks/subscriptions/{id}?include_secret=true`, in the format `whsec_...`
- **Timestamp tolerance:** the Svix library always enforces 5 minutes. The scheme itself has no window; that is the verifier's choice

If you set a custom secret when creating the subscription, paste the whsec_ secret Airweave returns for the subscription, not the value you sent.

## Why Does Signature Verification Matter?

Your webhook URL is public. Without verification anyone can POST a fake `sync.completed` and trigger your downstream workflow, or a fake `collection.deleted` and trigger a cleanup. Airweave's docs say to always verify in production.

## SDK Verification (Recommended)

Airweave recommends the official Svix libraries in production. They are available for Node.js and Python, so all three examples in this skill use them.

### Node.js (`svix` on npm)

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only and needs Node 22+

const wh = new Webhook(process.env.AIRWEAVE_WEBHOOK_SECRET); // "whsec_..." accepted as-is

// rawBody: string or Buffer of the EXACT bytes received
wh.verify(rawBody, {
  'svix-id': req.headers['svix-id'],
  'svix-timestamp': req.headers['svix-timestamp'],
  'svix-signature': req.headers['svix-signature'],
}); // throws WebhookVerificationError on failure; returns nothing
const event = JSON.parse(rawBody.toString('utf8'));
```

- Express: `express.raw({ type: '*/*' })` on the route, then pass `req.body` (a Buffer).
- Next.js App Router: `const rawBody = await request.text()`.

### Python (`svix` on PyPI)

```python
import json
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["AIRWEAVE_WEBHOOK_SECRET"])
raw_body = await request.body()
try:
    wh.verify(raw_body, {
        "svix-id": request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
    })  # returns None; raises WebhookVerificationError on failure
except WebhookVerificationError:
    raise HTTPException(status_code=400, detail="Invalid signature")
event = json.loads(raw_body)
```

The libraries also read `webhook-id`, `webhook-timestamp` and `webhook-signature` if the `svix-*` headers are absent.

## Why Do Retries and Replays Fail With "Message timestamp too old"?

The Svix library rejects any `svix-timestamp` more than 5 minutes from the current time, and you cannot configure that. Hookdeck retries and replays resend the original request with its original headers, including `svix-timestamp`, so a retry or replay delivered more than 5 minutes after the original fails the library's check even though the signature is valid.

If you receive Airweave events through Hookdeck and want late retries and replays to verify, use the manual verifier below. It runs the same HMAC check and lets you drop the window (`toleranceSeconds = null`) or widen it. Dropping the window removes replay protection, so deduplicate on `svix-id`.

## Manual Verification (No Window or a Custom Window)

This is the algorithm the SDK runs. It compares every space-separated `v1,<base64>` entry in constant time after a length check, ignores other versions such as `v1a`, and requires the timestamp to be a plain positive integer.

### Node.js

```javascript
import crypto from 'node:crypto';

// rawBody: Buffer of the exact bytes received. toleranceSeconds: null disables the window.
export function verifyAirweaveManually(rawBody, headers, secret, toleranceSeconds = null) {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];
  if (!secret || !id || !timestamp || !signatureHeader) return false;

  // Plain positive integer only: no signs, decimals, exponents or whitespace.
  if (!/^[1-9]\d*$/.test(timestamp)) return false;
  if (toleranceSeconds !== null && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) {
    return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.`)
    .update(rawBody)
    .digest();

  return signatureHeader.split(' ').some((entry) => {
    const comma = entry.indexOf(',');
    if (comma === -1 || entry.slice(0, comma) !== 'v1') return false;
    const provided = Buffer.from(entry.slice(comma + 1), 'base64');
    return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  });
}
```

### Python

```python
import base64, hashlib, hmac, re, time

def verify_airweave_manually(raw_body: bytes, headers: dict, secret: str, tolerance: int | None = None) -> bool:
    """tolerance=None disables the timestamp window."""
    msg_id = headers.get("svix-id")
    timestamp = headers.get("svix-timestamp")
    signature_header = headers.get("svix-signature")
    if not (secret and msg_id and timestamp and signature_header):
        return False

    # Plain positive integer only.
    if not re.fullmatch(r"[1-9][0-9]*", timestamp):
        return False
    if tolerance is not None and abs(int(time.time()) - int(timestamp)) > tolerance:
        return False

    try:
        key = base64.b64decode(secret.removeprefix("whsec_"))
    except ValueError:
        return False
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = hmac.new(key, signed, hashlib.sha256).digest()

    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version != "v1":
            continue
        try:
            provided = base64.b64decode(sig, validate=True)
        except ValueError:
            continue
        if len(provided) == len(expected) and hmac.compare_digest(provided, expected):
            return True
    return False
```

## Why Not Use Airweave's Manual Snippet?

The manual examples in Airweave's setup guide split `svix-signature` on `,` and take the last space-separated token:

```python
for sig in signature.split(","):
    sig_value = sig.split(" ")[-1]
```

That is not how Svix formats the header. The header is a space-delimited list of `v1,<sig>` entries, so this only works when there is exactly one signature. During a secret rotation Svix sends two (`v1,<old> v1,<new>`), and splitting on `,` then reading the last space-separated token drops the first one. Use the library or the verifier above, which check every entry.

## Common Gotchas

- **Raw body.** The HMAC covers the exact bytes Airweave sent. `express.json()`, `request.json()` or re-serialising with `JSON.stringify` changes whitespace and key order and breaks the signature. Verify first, then parse.
- **Decode the secret.** The key is the base64-decoded bytes after `whsec_`, not the literal `whsec_...` string. The SDK does this for you.
- **Use the returned secret.** A custom secret you supplied at creation is not what you paste. Use the `whsec_` value the API returns.
- **Several signatures.** `svix-signature` can carry more than one `v1,` entry. Accept the request if any entry matches, and ignore other versions.
- **svix 2.x `verify()` returns nothing.** Parse the raw body after verification. svix 2.x for JavaScript is also ESM-only and needs Node 22+.
- **Header case.** HTTP headers are case-insensitive. Node lowercases them (`req.headers['svix-id']`); Starlette's `request.headers` is case-insensitive.
- **Per-subscription secrets.** Each subscription has its own secret. Using one subscription's secret for another's deliveries fails.
- **Dedupe on `svix-id`.** It is stable across retries of a message to one subscription.

## How Do I Debug Verification Failures?

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `No matching signature found` | Body parsed or modified before verification | Use the raw body (`express.raw()`, `request.text()`, `await request.body()`) |
| `No matching signature found` with raw body | Wrong secret, or the value you sent instead of the one returned | Fetch it again with `?include_secret=true` |
| `Message timestamp too old` | Retry or replay after more than 5 minutes (Hookdeck keeps the original timestamp), or clock skew | Use the manual verifier with no window, or sync the server clock |
| `Message timestamp too new` | Server clock is behind | Sync the server clock (NTP) |
| `Missing required headers` | Proxy or framework stripped `svix-*` headers | Pass them through your load balancer / reverse proxy |
| Works locally, fails in production | A middleware parses JSON globally before your route | Mount the webhook route before the global JSON parser, or exclude it |
