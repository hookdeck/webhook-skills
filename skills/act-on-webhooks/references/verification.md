# How to Verify Act-On Webhook Signatures

## How Does Act-On Sign Webhooks?

Act-On sends outgoing webhooks through an embedded [Svix](https://www.svix.com/) portal and says it "will send a payload with a signature" generated with HMAC SHA-256. Act-On's pages don't name the headers or the secret prefix. They are the Svix defaults, which is what Hookdeck's Act-On source assumes:

| Header | Description |
|--------|-------------|
| `svix-id` | Unique message ID, the same on every retry |
| `svix-timestamp` | Unix timestamp (seconds) of this delivery attempt |
| `svix-signature` | Space-separated list of signatures, each `v1,<base64>` (for example `v1,abc123 v1,def456`) |

Because the `svix-` prefix is inferred, the snippets below (like Hookdeck) fall back to `webhook-id`, `webhook-timestamp` and `webhook-signature`, Svix's other header prefix, when the `svix-*` headers are absent. The signed content is the same either way.

- **Algorithm:** HMAC-SHA256, base64-encoded
- **Signed content:** `{svix-id}.{svix-timestamp}.{raw body}`
- **Key:** base64-decode the part of the secret after `whsec_`
- **Secret:** the endpoint's Signing Secret from the Act-On webhook portal (`ACT_ON_WEBHOOK_SECRET`). Paste the endpoint's Signing Secret from the Act-On webhook portal exactly as shown, including any whsec_ prefix.
- **Timestamp tolerance:** the `svix` library always enforces 5 minutes

## Why Does Signature Verification Matter?

Your webhook URL is public. Without verification anyone can POST a fake `contact-opt.global-opt-out` or `form.submitted` and change your contact data or trigger follow-up actions. Always verify in production.

## SDK Verification (Recommended)

### Node.js (`svix` on npm)

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only and needs Node 22+

const wh = new Webhook(process.env.ACT_ON_WEBHOOK_SECRET); // "whsec_..." accepted as-is

// rawBody: string or Buffer of the EXACT bytes received
wh.verify(rawBody, {
  'svix-id': req.headers['svix-id'] ?? req.headers['webhook-id'],
  'svix-timestamp': req.headers['svix-timestamp'] ?? req.headers['webhook-timestamp'],
  'svix-signature': req.headers['svix-signature'] ?? req.headers['webhook-signature'],
}); // throws WebhookVerificationError on failure; returns nothing
const payload = JSON.parse(rawBody.toString('utf8'));
```

- Express: `express.raw({ type: '*/*' })` on the route, then pass `req.body` (a Buffer). `*/*` makes it work for any content type.
- Next.js App Router: `const rawBody = await request.text()`.

### Python (`svix` on PyPI)

```python
import json
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["ACT_ON_WEBHOOK_SECRET"])
raw_body = await request.body()
try:
    wh.verify(raw_body, {
        "svix-id": request.headers.get("svix-id") or request.headers.get("webhook-id"),
        "svix-timestamp": request.headers.get("svix-timestamp") or request.headers.get("webhook-timestamp"),
        "svix-signature": request.headers.get("svix-signature") or request.headers.get("webhook-signature"),
    })  # returns None; raises WebhookVerificationError on failure
except WebhookVerificationError:
    raise HTTPException(status_code=400, detail="Invalid signature")
payload = json.loads(raw_body)
```

`verify()` in svix 2.x returns nothing (JS since 2.2, Python since 2.0). Verify first, then parse the raw body yourself.

## Why Do Retries and Replays Fail After 5 Minutes?

The `svix` library rejects any `svix-timestamp` more than 5 minutes from the current time, and the window isn't configurable. Retries and replays (including replays from Hookdeck) resend the **original** timestamp and signature, so a delivery retried later than 5 minutes after it was first sent fails verification even though the signature is valid.

If you receive these through Hookdeck and want late retries and replays to pass, use the manual verifier below with the window dropped or widened. Retries are safe to accept because you deduplicate on `svix-id`.

## Manual Verification (No Library, Configurable Window)

The window is off by default (`toleranceSeconds = 0`); pass a positive value, such as `300`, to opt in or widen it. The timestamp must be a plain positive integer, and every space-separated `v1,<base64>` entry is tried, compared in constant time.

### Node.js

```javascript
import crypto from 'node:crypto';

export function verifyActOn(rawBody, headers, secret, toleranceSeconds = 0) {
  const id = headers['svix-id'] ?? headers['webhook-id'];
  const timestamp = headers['svix-timestamp'] ?? headers['webhook-timestamp'];
  const signatures = headers['svix-signature'] ?? headers['webhook-signature'];
  if (!id || !timestamp || !signatures) return false;

  // Timestamp must be a plain positive integer (Unix seconds).
  if (!/^[0-9]+$/.test(timestamp) || Number(timestamp) <= 0) return false;
  if (toleranceSeconds > 0 && Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(Buffer.concat([Buffer.from(`${id}.${timestamp}.`), Buffer.from(rawBody)]))
    .digest();

  // The header holds one or more space-separated "v1,<base64>" entries; any match passes.
  return signatures.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    // canonical base64 only: Buffer.from ignores invalid characters
    return given.toString('base64') === sig && given.length === expected.length &&
      crypto.timingSafeEqual(given, expected);
  });
}
```

### Python

```python
import base64
import hashlib
import hmac
import re
import time


def verify_act_on(raw_body: bytes, headers: dict, secret: str, tolerance_seconds: int = 0) -> bool:
    msg_id = headers.get("svix-id") or headers.get("webhook-id")
    timestamp = headers.get("svix-timestamp") or headers.get("webhook-timestamp")
    signatures = headers.get("svix-signature") or headers.get("webhook-signature")
    if not msg_id or not timestamp or not signatures:
        return False

    # Timestamp must be a plain positive integer (Unix seconds).
    if not re.fullmatch(r"[0-9]+", timestamp) or int(timestamp) <= 0:
        return False
    if tolerance_seconds > 0 and abs(time.time() - int(timestamp)) > tolerance_seconds:
        return False

    key = base64.b64decode(secret.removeprefix("whsec_"))
    expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()

    # The header holds one or more space-separated "v1,<base64>" entries; any match passes.
    for entry in signatures.split(" "):
        version, _, sig = entry.partition(",")
        if version != "v1" or not sig:
            continue
        try:
            given = base64.b64decode(sig, validate=True)
        except ValueError:
            continue
        if hmac.compare_digest(given, expected):
            return True
    return False
```

## Common Gotchas

- **Raw body.** The signature covers the exact bytes. Parsing and re-serialising the JSON, or using `express.json()` before verification, breaks it.
- **Any content type.** Read the body with `express.raw({ type: '*/*' })` so a non-JSON content type doesn't leave you with an empty body.
- **Secret format.** Paste the Signing Secret as shown, including `whsec_`. The key is the base64-**decoded** part after the prefix, not the string itself. The `svix` library and the manual verifiers above also accept a secret without the prefix.
- **Multiple signatures.** `svix-signature` may hold several space-separated entries (for example during secret rotation). Accept the delivery if any `v1` entry matches.
- **No event type in the body.** Verification tells you the sender is genuine, not which event it is. See [overview.md](overview.md).
- **Status codes.** Return `400` (or `401`) for missing headers or a bad signature, and `500` if the secret isn't configured. Never fall through to processing.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Always fails | Wrong secret (another endpoint's, or the string not copied exactly), or the body was parsed before verifying |
| Fails only on retries or replays | The 5-minute window. Use the manual verifier with a larger or zero tolerance |
| Empty body | `express.raw()` limited to `application/json`; use `type: '*/*'` |
| `Missing Svix signature headers` | A proxy dropped the `svix-*` (or `webhook-*`) headers, or the request didn't come from Act-On's Svix portal |
| Works in tests, fails in production | A middleware (body parser, gateway) rewrote the body |
