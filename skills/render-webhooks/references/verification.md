# How to Verify Render Webhook Signatures

## How Does Render Sign Webhooks?

Render follows the [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md) specification:

| Header | Description |
|--------|-------------|
| `webhook-id` | The service event ID (`evt-...`). Same value as `data.id` in the body; identical across retries |
| `webhook-timestamp` | Unix seconds when this delivery attempt was sent. **Changes** on each retry |
| `webhook-signature` | `v1,<base64 HMAC-SHA256>`. Under the spec this can hold several space-separated `v1,...` entries |

Example:

```
webhook-id: evt-cv4cjhnnoe9s73c9l7s0
webhook-timestamp: 1741212102
webhook-signature: v1,XcslFHBlNT6cZYDOJVYUJGZMCNZgTArfO34vTJmjrj4=
```

- **Algorithm:** HMAC-SHA256, base64-encoded
- **Signed content:** `{webhook-id}.{webhook-timestamp}.{raw body}`
- **Key:** your webhook's signing secret from its **Settings** page. Per Standard Webhooks, the key bytes are the base64-decoded secret, after an optional `whsec_` prefix is removed
- **Timestamp tolerance:** the libraries reject timestamps more than 5 minutes from now, which Render's docs also suggest

## Why Does Signature Verification Matter?

Your webhook URL is public. Without verification, anyone could POST a fake `deploy_ended` with `"status": "succeeded"` and trigger your downstream deploys. The timestamp check also blocks replays of captured deliveries.

## SDK Verification (Recommended)

Render recommends the Standard Webhooks client libraries. They handle the key decoding, timestamp tolerance, multiple signatures and constant-time comparison.

### Node.js (`standardwebhooks` on npm)

```javascript
const { Webhook } = require('standardwebhooks');

const wh = new Webhook(process.env.RENDER_WEBHOOK_SECRET); // pass the secret as copied

// rawBody: string or Buffer of the EXACT bytes received
const event = wh.verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // returns parsed JSON or throws WebhookVerificationError
```

- Express: `express.raw({ type: '*/*' })` on the route, then pass `req.body` (a Buffer) or `req.body.toString('utf8')`.
- Next.js App Router: `const rawBody = await request.text()`.

This matches Render's own [webhook-receiver example](https://github.com/render-examples/webhook-receiver).

### Python (`standardwebhooks` on PyPI)

```python
from standardwebhooks.webhooks import Webhook

wh = Webhook(os.environ["RENDER_WEBHOOK_SECRET"])
event = wh.verify(await request.body(), {
    "webhook-id": request.headers.get("webhook-id"),
    "webhook-timestamp": request.headers.get("webhook-timestamp"),
    "webhook-signature": request.headers.get("webhook-signature"),
})  # raises WebhookVerificationError (or ValueError / binascii.Error on malformed input)
```

The Python SDK raises errors other than `WebhookVerificationError` for malformed input, such as a signature entry without a comma. Catch `Exception` around `verify()` and return `400`.

## Manual Verification (No SDK)

Use this where no Standard Webhooks library fits. The steps are the same in any language.

```javascript
const crypto = require('crypto');

function verifyRenderManually(rawBody, id, timestamp, signatureHeader, secret) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest();

  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const received = Buffer.from(sig, 'base64');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}
```

```python
import base64, hashlib, hmac, time

def verify_render_manually(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str, secret: str) -> bool:
    if abs(time.time() - int(timestamp)) > 300:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    return any(
        entry.startswith("v1,") and hmac.compare_digest(entry[3:], expected)
        for entry in signature_header.split(" ")
    )
```

## Common Gotchas

- **The secret isn't part of the signed string.** Render's docs show the format as `WEBHOOK_ID.WEBHOOK_TIMESTAMP.REQUEST_BODY.SIGNING_SECRET`, which reads as if the secret were appended. It isn't: the secret is the HMAC **key** and the message is `{id}.{timestamp}.{body}`. The libraries do this correctly.
- **Base64-decode the key.** Using the secret string's UTF-8 bytes as the HMAC key produces signatures that never match. Strip any `whsec_` prefix and base64-decode, or let the library do it.
- **Raw body only.** Verify the exact bytes. `express.json()`, `request.json()`, or a Pydantic model re-serialise the JSON (key order, whitespace, `\u` escapes), and the HMAC no longer matches.
- **`timestamp` ≠ `webhook-timestamp`.** The body's ISO `timestamp` is when the service event happened. Only the header's Unix-seconds value goes into the signature and the tolerance check.
- **Retries have a new timestamp and signature, same ID.** Don't dedupe on the signature. Use `webhook-id` / `data.id`.
- **Clock skew.** Deliveries more than 5 minutes off your server clock fail. Keep NTP running.
- **Multiple `v1,` entries.** Split the header on spaces and accept a match on any entry.

## How Do I Debug Verification Failures?

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Every delivery fails | Wrong secret (another webhook's, or a rotated one) | Re-copy from this webhook's **Settings** page |
| Every delivery fails with manual code | Key not base64-decoded, or secret appended to the message | Use the library, or follow the manual code above |
| Fails only in your framework | Body parsed before verification | Read the raw body (`express.raw`, `request.text()`, `request.body()`) |
| `Message timestamp too old` | Server clock drift, or replaying an old capture | Sync the clock; replay through a tool that re-signs |
| Webhook shows as disabled | All 8 attempts failed for a notification | Fix the endpoint, then re-enable from **Settings** |

Paste a captured delivery into the [Standard Webhooks verifier tool](https://www.standardwebhooks.com/verify) with your secret to check whether the problem is your code or the inputs.
