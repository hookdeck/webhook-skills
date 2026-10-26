# Axilio Signature Verification

## How Does Axilio Sign Webhooks?

Axilio signs every delivery with the [Standard Webhooks](https://www.standardwebhooks.com/) scheme. Each request carries three headers:

| Header | Value |
|--------|-------|
| `webhook-id` | Unique message identifier. Equals the body's `id`. |
| `webhook-timestamp` | Unix seconds when the delivery was sent |
| `webhook-signature` | One or more space-separated entries of the form `v1,<base64>` |

- Algorithm: HMAC-SHA256, base64 encoded.
- Signed content: `{webhook-id}.{webhook-timestamp}.{raw request body}`.
- Key: the signing secret is per destination and starts with `whsec_`. The key is the **base64-decoded** part after `whsec_`. Axilio shows the secret once, when you register the destination.
- Axilio's docs say to verify with any Standard Webhooks library (`standardwebhooks` on npm and PyPI) before you trust the body.

Store the **full** `whsec_...` value in `AXILIO_WEBHOOK_SECRET`. The library strips the prefix and decodes the key itself.

## How Do I Verify with the Standard Webhooks Library?

```javascript
const { Webhook } = require('standardwebhooks');

// rawBody must be the exact bytes Axilio sent, not re-serialised JSON.
const event = new Webhook(process.env.AXILIO_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws if the signature or timestamp is bad; returns the parsed event
```

```python
from standardwebhooks.webhooks import Webhook

event = Webhook(os.environ["AXILIO_WEBHOOK_SECRET"]).verify(raw_body, headers)  # raises on failure
```

Complete handlers with tests: [Express](../examples/express/), [Next.js](../examples/nextjs/), [FastAPI](../examples/fastapi/).

## Why Does the Library Reject Late Retries? (5-Minute Window)

The library always enforces a fixed 5-minute timestamp window, and you can't change it. Axilio retries failed deliveries after 30 seconds, 2 minutes, 5 minutes, 15 minutes and 1 hour, and Hookdeck retries and replays resend the **original** `webhook-timestamp`. So any retry or replay that lands more than 5 minutes after the first attempt is rejected as stale, even though the signature is valid.

If you need to accept those, verify manually and drop or widen the window. Idempotency on the event `id` already protects you from replays, so the window is optional.

## How Do I Verify Manually (Configurable Window)?

Compute `HMAC_SHA256(base64decode(secret after "whsec_"), id + "." + timestamp + "." + rawBody)` as base64, and compare it with **every** `v1,<base64>` entry in the header. Steps:

1. Read the raw body (Express: `express.raw({ type: '*/*' })`, Next.js: `await request.text()`, FastAPI: `await request.body()`).
2. Require all three headers.
3. Require `webhook-timestamp` to be a plain positive integer (digits only).
4. Optionally reject timestamps further than your tolerance from now. `0` turns the window off.
5. Compute the expected digest, then compare each space-separated `v1,<base64>` entry in constant time, after checking the decoded lengths match (`timingSafeEqual` throws on unequal lengths). Ignore entries with other versions.

```javascript
const crypto = require('crypto');

function verifyAxilioManually(rawBody, headers, secret, toleranceSeconds = 0) {
  const id = headers['webhook-id'];
  const ts = headers['webhook-timestamp'];
  const sigHeader = headers['webhook-signature'];
  if (!id || !ts || !sigHeader) return false;
  if (!/^[1-9]\d*$/.test(ts)) return false; // plain positive integer
  if (toleranceSeconds > 0 && Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSeconds) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${ts}.`).update(rawBody).digest();

  return sigHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}
```

```python
import base64, hashlib, hmac, re, time

def verify_axilio_manually(raw_body: bytes, headers: dict, secret: str, tolerance_seconds: int = 0) -> bool:
    msg_id = headers.get("webhook-id")
    ts = headers.get("webhook-timestamp")
    sig_header = headers.get("webhook-signature")
    if not msg_id or not ts or not sig_header:
        return False
    if not re.fullmatch(r"[1-9][0-9]*", ts):  # plain positive integer
        return False
    if tolerance_seconds > 0 and abs(time.time() - int(ts)) > tolerance_seconds:
        return False

    key = base64.b64decode(secret.removeprefix("whsec_"))
    expected = hmac.new(key, f"{msg_id}.{ts}.".encode() + raw_body, hashlib.sha256).digest()

    for entry in sig_header.split(" "):
        version, _, sig = entry.partition(",")
        if version != "v1" or not sig:
            continue
        try:
            given = base64.b64decode(sig, validate=True)
        except ValueError:
            continue
        if len(given) == len(expected) and hmac.compare_digest(given, expected):
            return True
    return False
```

`str.removeprefix` needs Python 3.9+. Fail closed: if `AXILIO_WEBHOOK_SECRET` is unset, return `500` instead of calling the verifier.

## Common Gotchas

- **Raw body only.** Parsing and re-serialising JSON changes the bytes and breaks the signature. In Express use `express.raw({ type: '*/*' })`, which also works for any content type, and parse the body only after the check.
- **Decode the key.** The HMAC key is the base64-decoded part after `whsec_`, not the secret string itself.
- **The secret is shown once.** If you lose it, register the destination again or rotate the secret with the API (`POST /webhooks/endpoints/{endpoint_id}:rotateSecret`). By default the previous secret keeps verifying for 24 hours so you can roll out the new one.
- **Several signatures.** The header can hold several space-separated entries. Accept the request if any `v1` entry matches.
- **Body `id` equals `webhook-id`.** Use it to discard duplicates.
- **Dashboard tests are real signed requests.** A **Test** delivery carries `"test": true` and an example payload, signed like a live event.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Body was parsed before verifying, or `AXILIO_WEBHOOK_SECRET` belongs to a different destination |
| Invalid for some content types only | Body parser limited to `application/json`; use `express.raw({ type: '*/*' })` |
| Invalid after a proxy | Proxy altered the body; verify the exact bytes received |
| Key mismatch with a hand-rolled check | The `whsec_` part was not stripped, or the rest was not base64-decoded |
| Fails only on retries or replays | The library's 5-minute window; use the manual verifier above with a wider tolerance, or `0` |
| `500` on every delivery | `AXILIO_WEBHOOK_SECRET` is unset; the handler fails closed |
