# How to Verify CloudTalk Webhook Signatures

## How Does CloudTalk Sign Webhooks?

Account-level CloudTalk webhooks (Settings → Webhooks) follow the [Svix webhook signature scheme](https://docs.svix.com/receiving/verifying-payloads/how). Every request has three headers:

| Header | Description |
|--------|-------------|
| `svix-id` | Unique delivery id. The same on every retry of the same event |
| `svix-timestamp` | Unix timestamp (seconds) when the request was sent |
| `svix-signature` | Space-delimited list of signatures, each `v1,<base64>` (e.g. `v1,abc123 v1,def456`) |

- **Algorithm:** HMAC-SHA256, base64-encoded
- **Signed content:** `{svix-id}.{svix-timestamp}.{raw body}`
- **Key:** base64-decode the part of the secret after `whsec_`
- **Timestamp tolerance:** 5 minutes (CloudTalk's recommendation and the Svix library default)

Not covered: the Call Flow Designer **Webhook** step, an AI Voice Agent's **Send via Webhook** option and Workflow Automation actions are **not** signed this way.

## Why Does Signature Verification Matter?

Your webhook URL is public. Without verification anyone who finds it can POST fake `call.ended` or `contact.created` events into your CRM or helpdesk integration.

## SDK Verification (Recommended)

CloudTalk points to the open-source Svix libraries. The Node.js and Python ones are used in this skill's examples.

### Node.js (`svix` on npm)

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only and needs Node 22+

const wh = new Webhook(process.env.CLOUDTALK_WEBHOOK_SECRET); // "whsec_..." accepted as-is

// rawBody: string or Buffer of the EXACT bytes received
wh.verify(rawBody, {
  'svix-id': req.headers['svix-id'],
  'svix-timestamp': req.headers['svix-timestamp'],
  'svix-signature': req.headers['svix-signature'],
}); // throws WebhookVerificationError on failure; returns nothing
const event = JSON.parse(rawBody.toString('utf8'));
```

- Express: `express.raw({ type: '*/*' })` on the route, then pass `req.body` (a Buffer). CloudTalk's own snippet uses `type: "application/json"`; `'*/*'` verifies whatever content type arrives.
- Next.js App Router: `const rawBody = await request.text()`.

### Python (`svix` on PyPI)

```python
import json
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["CLOUDTALK_WEBHOOK_SECRET"])
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

### Why Does `verify()` Return `undefined` / `None`?

CloudTalk's snippets assign `event = wh.verify(...)`. That matches svix 1.x. In **svix 2.x**, `Webhook.verify()` no longer returns the parsed payload (JavaScript since 2.2.0, Python since 2.0.0). Verify first, then `JSON.parse` / `json.loads` the raw body.

## Manual Verification (Fallback)

Use this for languages without a Svix library, or to debug. It is the same algorithm the SDK runs.

### Node.js

```javascript
const crypto = require('crypto');

function verifyManually(rawBody, headers, secret, toleranceSeconds = 300) {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds) {
    return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
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

def verify_manually(raw_body: bytes, headers: dict, secret: str, tolerance: int = 300) -> bool:
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

- **Raw body.** The HMAC covers the exact bytes CloudTalk sent. `express.json()`, `request.json()` or re-serialising with `JSON.stringify` changes whitespace and key order and breaks the signature. Verify first, then parse.
- **Decode the secret.** The key is the base64-decoded bytes after `whsec_`, not the literal `whsec_...` string. The SDK does this for you.
- **Several signatures.** `svix-signature` can carry more than one `v1,` entry, for example during secret rotation. Accept the request if any entry matches.
- **svix 2.x `verify()` returns nothing.** Parse the raw body after verification. svix 2.x for JavaScript is also ESM-only and needs Node 22+.
- **Per-endpoint secrets.** Each endpoint has its own signing secret. Using one endpoint's secret for another's deliveries fails.
- **Retries are re-signed.** Each retry has a fresh `svix-timestamp` but the same `svix-id` and `event_id`, so the 5-minute check passes on every attempt.
- **Other CloudTalk webhook sources.** Flow Designer, AI Voice Agent and Workflow Automation calls have no `svix-*` headers and will fail this check by design.
- **Header case.** HTTP headers are case-insensitive. Node lowercases them; Starlette's `request.headers` is case-insensitive.

## How Do I Debug Verification Failures?

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `No matching signature found` | Body parsed or modified before verification | Use the raw body (`express.raw()`, `request.text()`, `await request.body()`) |
| `No matching signature found` with raw body | Wrong secret (another endpoint, or rotated) | Reveal the current secret under Settings → Webhooks |
| `Message timestamp too old` / `too new` | Clock skew, or replaying an old captured request | Sync the server clock (NTP); use Resend in the delivery log for a fresh signature |
| `Missing required headers` | Proxy or framework stripped `svix-*` headers, or the request isn't an account-level webhook | Pass headers through your proxy; check the sender |
| Works locally, fails in production | A middleware parses JSON globally before your route | Mount the webhook route before the global JSON parser, or exclude it |
