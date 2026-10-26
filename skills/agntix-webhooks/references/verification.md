# How to Verify Agntix Webhook Signatures

## How Does Agntix Sign Webhooks?

Agntix delivers webhooks through [Svix](https://www.svix.com/), which uses the [Standard Webhooks](https://www.standardwebhooks.com/) scheme with `svix-*` header names. Every request has three headers:

| Header | Description |
|--------|-------------|
| `svix-id` | Message ID, for example `msg_2dQp…` |
| `svix-timestamp` | Unix timestamp in seconds when the message was sent |
| `svix-signature` | Space-delimited list of signatures, each `v1,<base64>` (for example `v1,abc123 v1,def456`) |

- **Algorithm:** HMAC-SHA256, base64-encoded
- **Signed content:** `{svix-id}.{svix-timestamp}.{raw body}`
- **Key:** for a `whsec_<base64>` secret, the base64-decoded part after `whsec_`
- **Secret:** per endpoint, from the dashboard's **Developer** section. Store the full `whsec_...` value in `AGNTIX_WEBHOOK_SECRET`
- **Timestamp tolerance:** the Svix library enforces a fixed ±5 minutes. Agntix's docs: "The `svix-timestamp` is enforced ±5 minutes"

Agntix authenticates deliveries by signature only. There is no API key, basic auth or documented IP allowlist.

## Why Does Signature Verification Matter?

Your webhook URL is public. Without verification anyone could POST a fake `session.ended` and push fabricated call outcomes into your CRM. Always verify before parsing or acting on the payload.

## SDK Verification (Recommended)

Agntix's docs use the official `svix` library, which exists for Node.js (`svix` on npm) and Python (`svix` on PyPI). All three examples in this skill use it.

### Node.js

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only and needs Node 22+

const wh = new Webhook(process.env.AGNTIX_WEBHOOK_SECRET); // "whsec_..." accepted as-is

// rawBody: Buffer or string of the EXACT bytes received
wh.verify(rawBody, {
  'svix-id': req.headers['svix-id'],
  'svix-timestamp': req.headers['svix-timestamp'],
  'svix-signature': req.headers['svix-signature'],
}); // throws WebhookVerificationError on failure; returns nothing in svix 2.x
const event = JSON.parse(rawBody.toString('utf8'));
```

- Express: `express.raw({ type: '*/*' })` on the route, then pass `req.body` (a Buffer). Agntix's own snippet uses `express.raw({ type: "application/json" })`; `'*/*'` also works when the content type differs.
- Next.js App Router: `const rawBody = await request.text()`.

### Python

```python
import json
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["AGNTIX_WEBHOOK_SECRET"])
raw_body = await request.body()
try:
    wh.verify(raw_body, {
        "svix-id": request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
    })  # raises WebhookVerificationError on failure
except WebhookVerificationError:
    raise HTTPException(status_code=400, detail="Invalid signature")
event = json.loads(raw_body)
```

The library also falls back to `webhook-id`, `webhook-timestamp` and `webhook-signature` if the `svix-*` headers are absent.

### Why Might `verify()` Return `undefined` / `None`?

Agntix's Node snippet reads `const payload = wh.verify(...)` and then calls `JSON.parse(payload.toString())`. That matches svix 1.x. In svix 2.x, `verify()` no longer returns the parsed payload (JavaScript since 2.2.0, Python since 2.0.0), so that snippet breaks with a current svix. Verify first, then `JSON.parse` / `json.loads` the raw body.

## How Do Hookdeck Retries Interact With the Timestamp Check?

Hookdeck retries and replays resend the **original** request, including its original `svix-timestamp`. The `svix` library always enforces a 5-minute window, so a retry or replay that reaches your handler more than 5 minutes after Agntix sent it fails verification with `Message timestamp too old`, even though the signature is valid. If you receive Agntix webhooks through Hookdeck and want late retries to succeed, use the manual verifier below, where the window can be dropped or widened.

## Manual Verification (No SDK, or a Different Replay Window)

This is the algorithm the library runs, with the timestamp window under your control. `toleranceSeconds = null` skips the window entirely. It also matches how Hookdeck's Agntix source verifies (Standard Webhooks, `svix` header prefix, every `v1` entry tried, other versions such as `v1a` ignored, no timestamp window).

### Node.js

```javascript
import crypto from 'node:crypto';

function verifyAgntixManually(rawBody, headers, secret, toleranceSeconds = null) {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];
  if (!id || !timestamp || !signatureHeader) return false;

  // The timestamp must be a plain positive integer.
  if (!/^[1-9]\d*$/.test(timestamp)) return false;
  if (toleranceSeconds !== null &&
      Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) {
    return false;
  }

  // whsec_<base64> -> base64-decoded bytes; any other secret -> its raw UTF-8 bytes.
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');

  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.`)
    .update(rawBody) // Buffer or string: the exact bytes received
    .digest('base64');
  const expectedBuf = Buffer.from(expected);

  // Try every space-separated entry; only v1 counts.
  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const candidate = Buffer.from(sig);
    return candidate.length === expectedBuf.length && crypto.timingSafeEqual(candidate, expectedBuf);
  });
}
```

### Python

```python
import base64, hashlib, hmac, re, time
from typing import Optional

def verify_agntix_manually(raw_body: bytes, headers: dict, secret: str,
                           tolerance: Optional[int] = None) -> bool:
    msg_id = headers.get("svix-id")
    timestamp = headers.get("svix-timestamp")
    signature_header = headers.get("svix-signature")
    if not (msg_id and timestamp and signature_header):
        return False

    # The timestamp must be a plain positive integer.
    if not re.fullmatch(r"[1-9][0-9]*", timestamp):
        return False
    if tolerance is not None and abs(int(time.time()) - int(timestamp)) > tolerance:
        return False

    # whsec_<base64> -> base64-decoded bytes; any other secret -> its raw UTF-8 bytes.
    if secret.startswith("whsec_"):
        key = base64.b64decode(secret[len("whsec_"):])
    else:
        key = secret.encode()

    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest())

    # Try every space-separated entry; only v1 counts.
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig.encode(), expected):
            return True
    return False
```

`hmac.compare_digest` compares in constant time and handles length differences safely. For a widened window, pass for example `tolerance=86400 * 2` (Agntix retries for up to 24 hours).

## Common Gotchas

- **Raw body.** The HMAC covers the exact bytes Agntix sent. `express.json()`, `request.json()` or re-serialising with `JSON.stringify` changes whitespace and key order and breaks the signature. Verify first, then parse.
- **Decode the secret.** The key is the base64-decoded bytes after `whsec_`, not the literal `whsec_...` string. The SDK does this for you.
- **Several signatures.** `svix-signature` can carry more than one `v1,` entry. Accept the request if any entry matches.
- **`eventType`, not `type`.** The event name is the top-level `eventType`. The top-level `type` is `VOICE` or `CHAT`.
- **Shared `id`.** `session.created` and `session.ended` carry the same `id` (the session UUID). Deduplicate on `eventType` + `id`.
- **Header case.** HTTP headers are case-insensitive. Node lowercases them (`req.headers['svix-id']`); Starlette's `request.headers` is case-insensitive.
- **Per-endpoint secrets.** Each endpoint has its own secret. Using one endpoint's secret for another's deliveries fails.
- **Missing secret.** Fail closed: return `500` rather than accepting unverified requests when `AGNTIX_WEBHOOK_SECRET` is unset.

## How Do I Debug Verification Failures?

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `No matching signature found` | Body parsed or modified before verification | Use the raw body (`express.raw()`, `request.text()`, `await request.body()`) |
| `No matching signature found` with raw body | Wrong secret (different endpoint, or a truncated value) | Copy the full `whsec_...` secret from the endpoint's page in **Developer** |
| `Message timestamp too old` | Clock skew, a replay, or a Hookdeck retry more than 5 minutes after the original delivery | Sync the server clock (NTP); use the manual verifier with no window or a wider one |
| `Message timestamp too new` | Server clock behind real time | Sync the server clock (NTP) |
| `Missing required headers` | Proxy or framework stripped `svix-*` headers | Pass them through your load balancer or reverse proxy |
| Works locally, fails in production | A middleware parses JSON globally before your route | Mount the webhook route before the global JSON parser, or exclude it |
