# How to Verify Browserbase Webhook Signatures

## How Does Browserbase Sign Webhooks?

Browserbase deliveries follow the [Standard Webhooks](https://www.standardwebhooks.com/) specification:

| Header | Description |
|--------|-------------|
| `webhook-id` | Unique message identifier |
| `webhook-timestamp` | Unix timestamp (seconds) of when the delivery was sent |
| `webhook-signature` | `v1,<base64 HMAC-SHA256>`. Under the spec this can hold several space-separated `v1,...` entries |

- **Algorithm:** HMAC-SHA256, base64-encoded
- **Signed content:** `{webhook-id}.{webhook-timestamp}.{raw body}`
- **Key:** the bytes you get by base64-**decoding** the part of the secret after `whsec_`
- **Secret:** returned only when you create or rotate the webhook (see [setup.md](setup.md))

## Why Does Signature Verification Matter?

Your endpoint is a public URL, so anyone can POST to it. Without verification, anyone could send a fake `functions.invocations.completed` and drive your downstream work. Verify every request and reject anything that fails.

## SDK Verification (Recommended)

Browserbase's docs say to use a Standard Webhooks library rather than writing the HMAC yourself. It handles constant-time comparison, multiple signatures and timestamp tolerance (±5 minutes in the official `standardwebhooks` packages).

### Node.js (`standardwebhooks` on npm)

```javascript
const { Webhook } = require('standardwebhooks');

const wh = new Webhook(process.env.BROWSERBASE_WEBHOOK_SECRET); // "whsec_..." accepted as-is

// rawBody: string or Buffer of the EXACT bytes received
const event = wh.verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // returns parsed JSON or throws WebhookVerificationError
```

- Express: `express.raw({ type: '*/*' })` on the route, then pass `req.body` (a Buffer).
- Next.js App Router: `const rawBody = await request.text()`.

### Python (`standardwebhooks` on PyPI)

```python
from standardwebhooks.webhooks import Webhook

wh = Webhook(os.environ["BROWSERBASE_WEBHOOK_SECRET"])
event = wh.verify(await request.body(), {
    "webhook-id": request.headers.get("webhook-id"),
    "webhook-timestamp": request.headers.get("webhook-timestamp"),
    "webhook-signature": request.headers.get("webhook-signature"),
})  # raises WebhookVerificationError (or ValueError / binascii.Error on malformed input)
```

The Python SDK can raise errors other than `WebhookVerificationError` for malformed input (for example a signature entry without a comma). Catch `Exception` around `verify()` and return `400`.

### Secret Rotation: Verify Against Both Secrets

After a rotation the previous secret keeps verifying for **24 hours** (unless revoked immediately). Browserbase's guidance is to deploy the new secret alongside the old one, so try each configured secret and accept the first that verifies:

```javascript
function verifyBrowserbaseWebhook(rawBody, headers) {
  const secrets = [process.env.BROWSERBASE_WEBHOOK_SECRET, process.env.BROWSERBASE_WEBHOOK_SECRET_PREVIOUS].filter(Boolean);
  let lastError = new Error('No signing secret configured');
  for (const secret of secrets) {
    try {
      return new Webhook(secret).verify(rawBody, headers);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
```

## Manual Verification (Reference)

You don't need this in Node.js or Python, where the SDK covers both. It's here for other languages and for debugging.

### Node.js

```javascript
const crypto = require('crypto');

function verifyBrowserbaseSignature(rawBody, headers, secret, toleranceSeconds = 300) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`) // rawBody as received
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

def verify_browserbase_signature(raw_body: bytes, headers, secret: str, tolerance: int = 300) -> bool:
    msg_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    signature_header = headers.get("webhook-signature")
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

- **Parsed or re-serialised body.** `express.json()`, `request.json()` or a Pydantic body model changes the bytes, so the HMAC won't match. Browserbase's docs call this out as the most common cause. Verify the raw bytes first, then parse.
- **Using the secret string as the HMAC key.** The key is `base64decode(secret without "whsec_")`, not the literal string. The SDK does this for you.
- **Lost secret.** No endpoint reads it back. Rotate to get a new one.
- **Fail closed.** If `BROWSERBASE_WEBHOOK_SECRET` isn't set, return `500` and reject the delivery. Never fall through to "accept".
- **Clock skew.** The SDK rejects timestamps more than 5 minutes from your server clock. Keep NTP running.
- **Only checking the first signature.** `webhook-signature` can contain several space-separated `v1,...` entries. Accept the delivery if any entry matches.
- **Non-constant-time comparison.** Use `crypto.timingSafeEqual` / `hmac.compare_digest` (the SDK already does).
- **Status codes.** Return `400` for bad signatures (Browserbase's own samples do). Browserbase retries non-`2xx` responses, which is harmless for forged requests.

## How to Debug Verification Failures

1. **Check the secret.** It must start with `whsec_` and be the one from the latest create or rotate response for *this* endpoint. During a rotation, set the old one as `BROWSERBASE_WEBHOOK_SECRET_PREVIOUS`.
2. **Check the body.** Log `rawBody.length` and the first bytes, and compare with the payload shown for that delivery in Settings → Webhooks. Any middleware that parses JSON first will break verification.
3. **Check the headers.** All three `webhook-*` headers must reach your handler. Some proxies strip unknown headers.
4. **Check the clock.** Compare `webhook-timestamp` with `date +%s` on your server.
5. **Reproduce locally.** Sign a payload with the manual function above and your secret, then POST it to your handler. If that passes, the problem is in what reaches the handler, not in the verification code.
