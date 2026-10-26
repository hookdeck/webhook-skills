# How to Verify Helcim Webhook Signatures

## How Does Helcim Sign Webhooks?

Helcim signs every webhook with HMAC-SHA256 using your `verifierToken` and follows [Standard Webhooks](https://standardwebhooks.com/). Each request includes:

| Header | Contents |
|--------|----------|
| `webhook-id` | Message ID (stable across retries; your idempotency key) |
| `webhook-timestamp` | Unix seconds when the message was sent |
| `webhook-signature` | Space-delimited list of `v1,<base64 signature>` entries (usually one) |

Svix uses the same scheme under `svix-id`, `svix-timestamp` and `svix-signature`. Hookdeck reads the `webhook-*` names and falls back to the `svix-*` names when `webhook-id` is absent, so the examples do the same and then hand the library the values under the `webhook-*` names it expects.

The algorithm:

1. Signed content: `{webhook-id}.{webhook-timestamp}.{raw body}`.
2. The HMAC key is the **base64-decoded** `verifierToken` (Helcim's own sample: "Need to base64 decode the verifierToken"). The token has no `whsec_` prefix; if one is present it is stripped first.
3. HMAC-SHA256 the signed content with that key and base64-encode the digest.
4. Compare it in constant time against each `v1,` entry. Any match passes; ignore other versions such as `v2` or `v1a`.
5. Helcim documents no timestamp tolerance. The Standard Webhooks libraries enforce 5 minutes.

## SDK Verification (recommended)

### Node.js

```javascript
const { Webhook } = require('standardwebhooks'); // CommonJS; `import { Webhook } from 'standardwebhooks'` also works

const p = headers['webhook-id'] ? 'webhook' : 'svix';
new Webhook(process.env.HELCIM_WEBHOOK_SECRET).verify(rawBody, {
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

p = "webhook" if headers.get("webhook-id") else "svix"
try:
    Webhook(os.environ["HELCIM_WEBHOOK_SECRET"]).verify(
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

## Why Do Hookdeck Retries and Replays Fail the SDK Check?

The `standardwebhooks` library always enforces a fixed 5-minute timestamp window and has no option to change it. Helcim documents no window of its own. Hookdeck retries and replays resend the original request, including the original `webhook-timestamp`, so one more than 5 minutes after the first delivery is rejected as "Message timestamp too old" even though the signature is valid. Helcim's own schedule waits up to 10 hours between attempts, so this also bites when Helcim retries into a handler that has been down.

If your handler sits behind Hookdeck, or you replay events for debugging, use the manual verifier below, which drops the window (`toleranceSeconds = null`) or widens it. Replay protection then comes from deduplicating on `webhook-id`.

## Manual Verification (configurable timestamp window)

```javascript
const crypto = require('node:crypto');

// toleranceSeconds: null disables the timestamp check; 300 matches the SDK; larger widens it
function verifyHelcim(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = null) {
  // The timestamp must be a plain positive integer, even when no window is applied
  if (!/^\d+$/.test(timestamp) || Number(timestamp) <= 0) return false;
  if (toleranceSeconds !== null && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) {
    return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
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

def verify_helcim(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
                  secret: str, tolerance_seconds: Optional[int] = None) -> bool:
    # tolerance_seconds=None disables the timestamp check; 300 matches the SDK
    if not re.fullmatch(r"[0-9]+", timestamp) or int(timestamp) <= 0:
        return False
    if tolerance_seconds is not None and abs(int(time.time()) - int(timestamp)) > tolerance_seconds:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig.encode(), expected.encode()):
            return True
    return False
```

Call it with the values resolved from the `webhook-*` or `svix-*` headers, and reply `401` when it returns false. Fail closed (`500`) if `HELCIM_WEBHOOK_SECRET` is unset.

## Common Gotchas

- **Raw body only.** Parsing JSON and re-serializing changes whitespace and key order. Use `express.raw({ type: '*/*' })`, `await request.text()` (Next.js), or `await request.body()` (FastAPI).
- **Decode the token.** The HMAC key is the base64-decoded bytes of the `verifierToken`, not the literal string. Helcim's Node sample uses `new Buffer(verifierToken, "base64")`, which is deprecated: use `Buffer.from`.
- **Hookdeck needs `whsec_`.** Hookdeck decodes only `whsec_` secrets, so paste the token there as `whsec_` followed by the token: "Paste your verifierToken as whsec_ followed by the token, or verification fails."
- **Multiple signatures.** Split `webhook-signature` on spaces and accept any matching `v1,` entry. Don't compare the whole header.
- **Fixed 5-minute window in the library.** See the Hookdeck section above.
- **Header names.** Frameworks lower-case them; read `webhook-id`, then fall back to `svix-id`.
- **Deliver URL.** It must be `https` and can't contain "Helcim".
- **CSRF middleware** must be disabled on the webhook route.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "No matching signature found" | Wrong token (a different account's), or the body was parsed/re-serialized before verification |
| Fails only in Hookdeck | The source secret was pasted without the `whsec_` prefix |
| Fails only after deploys or proxies | A proxy or middleware rewrote the body or stripped headers |
| "Message timestamp too old" on retries or replays | The library's fixed 5-minute window; use the manual verifier |
| "Message timestamp too old" on first delivery | Server clock drift |
| Missing headers | Something in front of your app dropped `webhook-*` headers |
