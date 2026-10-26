# How to Verify Memos Webhook Signatures

## How Does Memos Sign Webhooks?

Since 0.31 Memos signs deliveries in the [Standard Webhooks](https://standardwebhooks.com/) format, **only when the webhook has a signing secret** (the sender checks for a non-empty secret). New webhooks get one; older webhooks are unsigned until a secret is generated in the edit dialog. Each signed request includes:

| Header | Contents |
|--------|----------|
| `webhook-id` | Unique message ID beginning with `msg_` (stable across retries; your idempotency key) |
| `webhook-timestamp` | Unix seconds when the message was sent |
| `webhook-signature` | Space-delimited list of `v1,<base64 signature>` entries |

Svix uses the same scheme under `svix-id`, `svix-timestamp` and `svix-signature`. Hookdeck reads the `webhook-*` names and falls back to the `svix-*` names when `webhook-id` is absent, so the examples do the same and then hand the library the values under the `webhook-*` names it expects.

The algorithm:

1. Signed content: `{webhook-id}.{webhook-timestamp}.{raw body}`.
2. If the secret starts with `whsec_`, strip that prefix and base64-decode the rest to get the key. Memos' sender uses any other secret value as its raw bytes, so do the same.
3. HMAC-SHA256 the signed content with that key and base64-encode the digest.
4. Compare it in constant time against each `v1,` entry. Any match passes; ignore other versions such as `v1a`.
5. Reject the request if `webhook-timestamp` is too far from the current time. The Standard Webhooks libraries allow 5 minutes.

## SDK Verification (recommended)

### Node.js

```javascript
const { Webhook } = require('standardwebhooks'); // CommonJS; `import { Webhook } from 'standardwebhooks'` also works

const secret = process.env.MEMOS_WEBHOOK_SECRET;
// whsec_ secrets are base64-decoded by the library; any other value is the raw key, as in Memos' sender
const wh = secret.startsWith('whsec_')
  ? new Webhook(secret)
  : new Webhook(Buffer.from(secret, 'utf8'), { format: 'raw' });

const p = headers['webhook-id'] ? 'webhook' : 'svix';
wh.verify(rawBody, {
  'webhook-id': headers[`${p}-id`],
  'webhook-timestamp': headers[`${p}-timestamp`],
  'webhook-signature': headers[`${p}-signature`],
}, { jsonParse: false });
// verify() throws on failure. With jsonParse: false it returns undefined; parse rawBody yourself afterwards.
```

With Express, read the body with `express.raw({ type: '*/*' })` so any content type reaches the verifier as a Buffer.

### Python

```python
from standardwebhooks.webhooks import Webhook

secret = os.environ["MEMOS_WEBHOOK_SECRET"]
# whsec_ secrets are base64-decoded by the library; bytes are used as the raw key, as in Memos' sender
wh = Webhook(secret if secret.startswith("whsec_") else secret.encode("utf-8"))

p = "webhook" if headers.get("webhook-id") else "svix"
try:
    wh.verify(
        raw_body,
        {
            "webhook-id": headers.get(f"{p}-id"),
            "webhook-timestamp": headers.get(f"{p}-timestamp"),
            "webhook-signature": headers.get(f"{p}-signature"),
        },
        json_parse=False,
    )
except Exception:  # WebhookVerificationError, or ValueError for a malformed signature entry
    ...  # return 401
```

Memos doesn't ship a receiving SDK, so the `standardwebhooks` library is the recommended route. It only reads the `webhook-*` header names, so the `svix-*` fallback just remaps the three values.

## Why Do Hookdeck Retries and Replays Fail the SDK Check?

The `standardwebhooks` library always enforces a fixed 5-minute timestamp window and has no option to change it. Hookdeck retries and replays resend the original request, including the original `webhook-timestamp`. A retry or replay more than 5 minutes after the first delivery is rejected as "Message timestamp too old", even though the signature is valid. Memos' docs recommend rejecting timestamps outside "a small tolerance window", so choose your own window.

If your handler sits behind Hookdeck, or you replay events for debugging, use the manual verifier below, which drops the window (`toleranceSeconds = null`) or widens it. Replay protection then comes from deduplicating on `webhook-id`.

## Manual Verification (configurable timestamp window)

```javascript
const crypto = require('node:crypto');

// toleranceSeconds: null disables the timestamp check; 300 matches the SDK; larger widens it
function verifyMemos(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = null) {
  // The timestamp must be a plain positive integer, even when no window is applied
  if (!/^\d+$/.test(timestamp) || Number(timestamp) <= 0) return false;
  if (toleranceSeconds !== null && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) {
    return false;
  }

  // whsec_ secrets are base64-decoded; any other value is the raw key (as in Memos' sender)
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.`)
    .update(rawBody) // Buffer or string, exactly as received
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

```python
import base64, hashlib, hmac, re, time
from typing import Optional

def verify_memos(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
                secret: str, tolerance_seconds: Optional[int] = None) -> bool:
    # tolerance_seconds=None disables the timestamp check; 300 matches the SDK
    if not re.fullmatch(r"[0-9]+", timestamp) or int(timestamp) <= 0:
        return False
    if tolerance_seconds is not None and abs(int(time.time()) - int(timestamp)) > tolerance_seconds:
        return False
    # whsec_ secrets are base64-decoded; any other value is the raw key (as in Memos' sender)
    key = base64.b64decode(secret.removeprefix("whsec_")) if secret.startswith("whsec_") else secret.encode()
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig.encode(), expected.encode()):
            return True
    return False
```

Call it with the values resolved from the `webhook-*` or `svix-*` headers, and reply `401` when it returns false.

## Common Gotchas

- **Raw body only.** Parsing JSON and re-serializing changes whitespace and key order. Use `express.raw({ type: '*/*' })`, `await request.text()` (Next.js), or `await request.body()` (FastAPI). `'*/*'` also works when the content type is odd.
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not the literal string.
- **Multiple signatures.** Split `webhook-signature` on spaces and accept any matching `v1,` entry. Don't compare the whole header.
- **Fixed 5-minute window in the library.** See the Hookdeck section above.
- **Unsigned older webhooks.** A webhook without a signing secret sends no `webhook-*` headers at all. Generate a secret in the edit dialog.
- **Decode the secret only for `whsec_`.** Memos uses any other secret value as raw bytes.
- **Answer `{"code":0}`.** Verification passing isn't enough: Memos counts a 2xx without JSON `{"code":0}` as failed.
- **Header names.** Frameworks lower-case them; read `webhook-id`, then fall back to `svix-id`.
- **CSRF middleware** must be disabled on the webhook route.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "No matching signature found" | Wrong secret (a different webhook's), or the body was parsed/re-serialized before verification |
| Fails only after deploys or proxies | A proxy or middleware rewrote the body or stripped headers |
| "Message timestamp too old" on retries or replays | The library's fixed 5-minute window; use the manual verifier |
| "Message timestamp too old" on first delivery | Server clock drift |
| Missing headers | Something in front of your app dropped `webhook-*` headers |
| Every request has no `webhook-*` headers | The webhook is an older, unsigned one: generate a signing secret in the Memos edit dialog |
| Memos shows the delivery as failed but you return 200 | The response body isn't JSON `{"code":0}` |
