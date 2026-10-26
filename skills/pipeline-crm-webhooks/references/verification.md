# How to Verify Pipeline CRM Webhook Signatures

## How Does Pipeline CRM Sign Webhooks?

Pipeline CRM implements [Standard Webhooks](https://www.standardwebhooks.com/). Each signed delivery carries:

| Header | Value |
|--------|-------|
| `webhook-id` | Unique delivery ID, stable across retries |
| `webhook-timestamp` | Unix seconds when **this attempt** was sent (not when queued) |
| `webhook-signature` | `v1,<base64 signature>`, space-separated when more than one secret is active |

The signature is HMAC-SHA256, base64-encoded, over `{webhook-id}.{webhook-timestamp}.{raw request body}`, keyed with the **base64-decoded** part of the secret after the `whsec_` prefix. Signing is opt-in per endpoint (see [setup.md](setup.md)). Pipeline CRM does not enforce a timestamp window; that is up to the verifier.

## How Do I Verify With a Library?

```javascript
const { Webhook } = require('standardwebhooks');
const event = new Webhook(process.env.PIPELINE_CRM_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws on failure, returns parsed JSON
```

```python
from standardwebhooks.webhooks import Webhook
event = Webhook(secret).verify(raw_body, {
    "webhook-id": request.headers["webhook-id"],
    "webhook-timestamp": request.headers["webhook-timestamp"],
    "webhook-signature": request.headers["webhook-signature"],
})
```

The `standardwebhooks` and `svix` libraries **always** reject a `webhook-timestamp` more than 5 minutes from now. The window is not configurable.

## Why Do Hookdeck Retries and Replays Fail the Library Check?

Hookdeck retries and replays resend the original request with the original `webhook-timestamp`. A retry that fires after the first 5 minutes, or a replay of an old event, is rejected by the library even though the signature is valid. If you receive through Hookdeck, or replay events, use the manual verifier below and drop the window (Hookdeck's own retry logic and `webhook-id` dedupe replace it) or widen it to cover your retry schedule.

## How Do I Verify Manually (Without the Window)?

Compute HMAC-SHA256 over `{id}.{timestamp}.{raw body}` with the base64-decoded secret, then compare against **every** space-separated `v1,<base64>` entry in constant time. Pass `toleranceSeconds = null` to skip the timestamp check, or a number to widen it.

```javascript
const crypto = require('crypto');

function verify(secret, headers, rawBody, toleranceSeconds = null) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const header = headers['webhook-signature'];
  if (!id || !timestamp || !header) return false;

  if (toleranceSeconds !== null) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest();

  return String(header).split(' ').some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    const got = Buffer.from(signature, 'base64');
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}
```

```python
import base64, hashlib, hmac, time

def verify(secret: str, headers: dict, raw_body: bytes, tolerance_seconds=None) -> bool:
    msg_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    header = headers.get("webhook-signature")
    if not (msg_id and timestamp and header):
        return False

    if tolerance_seconds is not None:
        try:
            if abs(time.time() - int(timestamp)) > tolerance_seconds:
                return False
        except ValueError:
            return False

    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = hmac.new(key, signed, hashlib.sha256).digest()

    for entry in header.split(" "):
        version, _, signature = entry.partition(",")
        if version != "v1" or not signature:
            continue
        try:
            got = base64.b64decode(signature, validate=True)
        except ValueError:
            continue
        if hmac.compare_digest(got, expected):
            return True
    return False
```

## Common Gotchas

- **Raw body:** verify the exact bytes Pipeline CRM sent. A re-serialised body never matches. In Express use `express.raw({ type: '*/*' })` so any content type is verified; in FastAPI use `await request.body()`; in Next.js use `await request.text()`.
- **Decoded key:** key the HMAC with the base64-decoded bytes after `whsec_`, not the printable string.
- **Every signature:** during a rotation the header holds two entries. Checking only the first breaks halfway through.
- **Timestamp is per attempt:** `webhook-timestamp` changes on each Pipeline CRM retry, but Hookdeck retries and replays reuse the original value.
- **Unsigned deliveries:** signing is opt-in; without **Enable signing** the headers are absent.
- **Dedupe:** `webhook-id` is stable across retries and is the only delivery ID.

## How Do I Debug Verification Failures?

| You see | Almost always |
|---------|---------------|
| Every signature fails | Verifying a parsed body instead of the raw bytes, or keying with the `whsec_` string |
| Worked, then failed after rotating | Only the first signature in the header is checked |
| Fails only on retries or replays | The library's 5-minute window with the original timestamp; use the manual verifier |
| No signature headers | Signing is not enabled for that Call an API action, or the delivery predates enabling it |
| Valid but duplicated | Deduplicate on `webhook-id` |
