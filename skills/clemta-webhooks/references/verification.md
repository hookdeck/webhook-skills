# How to Verify Clemta Webhook Signatures

## How Does Clemta Sign Webhooks?

Clemta follows the [Standard Webhooks](https://www.standardwebhooks.com) specification. Each request includes:

| Header | Contents |
|--------|----------|
| `webhook-id` | Event id (stable across retries; your idempotency key) |
| `webhook-timestamp` | Unix seconds of the attempt |
| `webhook-signature` | Space-delimited list of `v1,<base64>` (HMAC) and `v1a,<base64>` (Ed25519) entries |

Clemta also sends the same three values as `Clemta-Webhook-Id`, `Clemta-Webhook-Timestamp` and `Clemta-Webhook-Signature`. Hookdeck reads the `webhook-*` names and falls back to `svix-id`, `svix-timestamp` and `svix-signature` when `webhook-id` is absent, so the examples do the same.

The algorithm:

1. Signed content: `{webhook-id}.{webhook-timestamp}.{raw body}`.
2. Strip `whsec_` from the signing secret and base64-decode the rest to get the key.
3. HMAC-SHA256 the signed content with that key and base64-encode the digest.
4. Compare it in constant time against each `v1,` entry. Any match passes (two entries appear during a secret rotation). Ignore other versions such as `v1a`.

## SDK Verification (recommended)

### Node.js

```javascript
const { Webhook } = require('standardwebhooks');

const p = headers['webhook-id'] ? 'webhook' : 'svix';
const [id, timestamp, signature] = ['id', 'timestamp', 'signature'].map((k) => headers[`${p}-${k}`]);
new Webhook(process.env.CLEMTA_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature,
});
// verify() returns the parsed JSON body and throws on failure.
```

With Express, read the body with `express.raw({ type: '*/*' })` so any content type reaches the verifier, and pass `req.body.toString('utf8')`.

### Python

```python
from standardwebhooks.webhooks import Webhook, WebhookVerificationError

p = "webhook" if headers.get("webhook-id") else "svix"
msg_id, ts, sig = (headers.get(f"{p}-{k}") for k in ("id", "timestamp", "signature"))
try:
    Webhook(os.environ["CLEMTA_WEBHOOK_SECRET"]).verify(raw_body, {
        "webhook-id": msg_id, "webhook-timestamp": ts, "webhook-signature": sig,
    })
except WebhookVerificationError:
    ...  # return 400
```

## Why Do Hookdeck Retries and Replays Fail the SDK Check?

The `standardwebhooks` library always enforces a fixed 5-minute timestamp window and has no option to change it. Clemta re-signs each retry with a fresh timestamp, but Hookdeck retries and replays resend the original request, including the original `webhook-timestamp`. A retry or replay more than 5 minutes after the first delivery is rejected as "Message timestamp too old", even though the signature is valid.

If your handler sits behind Hookdeck, or you replay events for debugging, use the manual verifier below, which drops the window (`toleranceSeconds = null`) or widens it. Replay protection then comes from deduplicating on `webhook-id`.

## Manual Verification (configurable timestamp window)

```javascript
const crypto = require('node:crypto');

// toleranceSeconds: null disables the timestamp check; 300 matches the SDK; larger widens it
function verifyClemta(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds = null) {
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

def verify_clemta(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
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
        if version == "v1" and len(sig) == len(expected) and hmac.compare_digest(sig.encode(), expected.encode()):
            return True
    return False
```

## Verifying Without a Shared Secret (`v1a`)

Every delivery from an endpoint that has a keypair also carries a `v1a,<base64>` Ed25519 signature over the same `{id}.{timestamp}.{body}` string. Verify it with the endpoint's `public_key` (`whpk_...`, base64-decoded after the prefix) if the verifying service shouldn't hold a secret that can also sign. Clemta's documentation shows a Node `crypto.verify` example. The `standardwebhooks` library and Hookdeck's Clemta source use the `v1` HMAC only and skip `v1a`. Endpoints created before asymmetric signing shipped sign `v1` only.

## Common Gotchas

- **Raw body only.** Parsing JSON and re-serializing changes whitespace and key order. Use `express.raw({ type: '*/*' })`, `await request.text()` (Next.js), or `await request.body()` (FastAPI).
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not the literal string.
- **Multiple signatures.** Split `webhook-signature` on spaces and accept any matching `v1,` entry. Don't compare the whole header, and skip `v1a,`.
- **Fixed 5-minute window in the SDK.** See the Hookdeck section above.
- **Header names.** Frameworks lower-case them; read `webhook-id`, then fall back to `svix-id`.
- **Per-endpoint secrets.** Each endpoint has its own secret; one endpoint's secret won't verify another's deliveries.
- **CSRF middleware** must be disabled on the webhook route.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "Invalid signature" | Wrong endpoint's secret, or the body was parsed/re-serialized before verification |
| Fails only after deploys or proxies | A proxy or middleware rewrote the body or stripped headers |
| "Timestamp too old" on retries or replays | The SDK's fixed 5-minute window; use the manual verifier |
| "Timestamp too old" on first delivery | Server clock drift |
| Fails right after a secret roll | Still using the old secret after the overlap ended |
| Missing headers | Something in front of your app dropped `webhook-*` headers |
