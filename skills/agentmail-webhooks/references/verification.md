# How to Verify AgentMail Webhook Signatures

## How Does AgentMail Sign Webhooks?

AgentMail delivers webhooks through [Svix](https://www.svix.com/). Every request has three headers:

| Header | Description |
|--------|-------------|
| `svix-id` | Unique message identifier. Same for retries of a message to one webhook, but different between webhooks at the organization, pod and inbox levels |
| `svix-timestamp` | Unix timestamp (seconds) when the message was sent |
| `svix-signature` | Space-delimited list of signatures, each `v1,<base64>` (e.g. `v1,abc123 v1,def456`) |

- **Algorithm:** HMAC-SHA256, base64-encoded
- **Signed content:** `{svix-id}.{svix-timestamp}.{raw body}`
- **Key:** base64-decode the part of the secret after `whsec_`
- **Timestamp tolerance:** 5 minutes (the Svix library default)

## Why Does Signature Verification Matter?

Your webhook URL is public. Without verification anyone could POST a fake `message.received` and get your agent to act on attacker-written email, which is a direct prompt-injection path. Always verify in production.

## SDK Verification (Recommended)

AgentMail's docs recommend the official `svix` library. It's available for both Node.js and Python, so all three examples in this skill use it.

### Node.js (`svix` on npm)

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only and needs Node 22+

const wh = new Webhook(process.env.AGENTMAIL_WEBHOOK_SECRET); // "whsec_..." accepted as-is

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

wh = Webhook(os.environ["AGENTMAIL_WEBHOOK_SECRET"])
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

AgentMail's docs show `msg = wh.verify(payload, headers)` and then read `msg.event_type`. That matches svix 1.x. In **svix 2.x**, `Webhook.verify()` no longer returns the parsed payload (JavaScript since 2.2.0, Python since 2.0.0; see the [svix changelog](https://github.com/svix/svix-webhooks/blob/main/ChangeLog.md)). With a current svix the doc snippet gives `undefined` (JS) or `None` (Python), and reading `event_type` from it crashes after a successful verification. Verify first, then `JSON.parse` / `json.loads` the raw body.

## Manual Verification (Fallback)

Use this for languages without a Svix library, or to debug. It's the same algorithm the SDK runs.

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

- **Raw body.** The HMAC covers the exact bytes AgentMail sent. `express.json()`, `request.json()` or re-serialising with `JSON.stringify` changes whitespace and key order and breaks the signature. Verify first, then parse.
- **Decode the secret.** The key is the base64-decoded bytes after `whsec_`, not the literal `whsec_...` string. The SDK does this for you.
- **Several signatures.** `svix-signature` can carry more than one `v1,` entry (for example during secret rotation). Accept the request if any entry matches.
- **svix 2.x `verify()` returns nothing.** Parse the raw body after verification (see above). svix 2.x for JavaScript is also ESM-only and needs Node 22+.
- **Header case.** HTTP headers are case-insensitive. Node lowercases them (`req.headers['svix-id']`); Starlette's `request.headers` is case-insensitive.
- **Timestamp tolerance.** The SDK rejects timestamps more than 5 minutes off. Check server clock skew if valid-looking requests fail.
- **Per-webhook secrets.** Organization, pod and inbox webhooks each have their own secret. Using one webhook's secret for another's deliveries fails.
- **Dedupe on `event_id`, not `svix-id`.** `svix-id` is only stable within one webhook.
- **Signature headers ≠ authentication of content.** A verified `message.received` proves AgentMail sent it, not that the email itself is trustworthy. Check `labels` (`unauthenticated`, `spam`) and treat email bodies as untrusted input to your agent.

## How Do I Debug Verification Failures?

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `No matching signature found` | Body parsed or modified before verification | Use the raw body (`express.raw()`, `request.text()`, `await request.body()`) |
| `No matching signature found` with raw body | Wrong secret (different webhook, or test vs production) | Fetch it again with `client.webhooks.get(id).secret` |
| `Message timestamp too old` / `too new` | Clock skew, or replaying an old captured request | Sync the server clock (NTP); re-send a fresh event |
| `Missing required headers` | Proxy or framework stripped `svix-*` headers | Pass them through your load balancer / reverse proxy |
| Works locally, fails in production | A middleware parses JSON globally before your route | Mount the webhook route before the global JSON parser, or exclude it |
