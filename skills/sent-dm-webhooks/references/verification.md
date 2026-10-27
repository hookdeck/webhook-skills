# How to Verify Sent Webhook Signatures

Sent signs webhooks "Svix-style": the [Standard Webhooks](https://www.standardwebhooks.com) scheme on `X-Webhook-*` header names. Sent's SDKs do not verify inbound webhooks, so verification is yours to implement.

## How Does Sent Sign Webhooks?

| Header | Value |
|--------|-------|
| `X-Webhook-ID` | UUID of the webhook configuration (constant across events, but part of the signed content) |
| `X-Webhook-Timestamp` | Unix seconds when this attempt was signed |
| `X-Webhook-Signature` | One or more space-separated `v1,<base64>` entries (Sent sends one today) |

```
key             = base64_decode( secret without the "whsec_" prefix )
signed_content  = "{X-Webhook-ID}.{X-Webhook-Timestamp}.{raw_body}"
expected        = "v1," + base64( HMAC_SHA256(key, signed_content) )
```

Compare `expected` with every entry of `X-Webhook-Signature` in constant time. Any match is valid.

## Implementation

### Library Verification (recommended)

`standardwebhooks` (npm and PyPI) reads `webhook-*` header names, so map Sent's headers onto them. Do not use the `svix` library, which reads `svix-*` names.

```javascript
const { Webhook } = require('standardwebhooks');

const event = new Webhook(process.env.SENT_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.headers['x-webhook-id'],
  'webhook-timestamp': req.headers['x-webhook-timestamp'],
  'webhook-signature': req.headers['x-webhook-signature'],
}); // throws on failure; returns the parsed JSON
```

```python
from standardwebhooks.webhooks import Webhook

event = Webhook(secret).verify(raw_body, {
    "webhook-id": request.headers["x-webhook-id"],
    "webhook-timestamp": request.headers["x-webhook-timestamp"],
    "webhook-signature": request.headers["x-webhook-signature"],
})  # raises WebhookVerificationError on failure
```

The library always enforces a fixed 5-minute timestamp window. Sent signs each retry when it is sent, so Sent's own retries pass. **Hookdeck retries and replays resend the original timestamp**, and Hookdeck applies no window itself, so the library rejects a Hookdeck retry or replay after 5 minutes. Use the manual verifier below when you need those to pass.

### Manual Verification (no dependency, adjustable window)

`toleranceSeconds` defaults to 300. Pass `null` to turn the window off, or a larger number to widen it (needed for late Hookdeck retries and replays). Like Hookdeck, it reads `x-webhook-*` names and falls back to `webhook-*` and `svix-*`, requires the timestamp to be a plain positive integer, validates base64, and treats a secret without the `whsec_` prefix as raw UTF-8 bytes.

```javascript
import { createHmac, timingSafeEqual } from 'node:crypto';

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function verifySent(rawBody, headers, secret, toleranceSeconds = 300) {
  const get = (n) => headers[`x-webhook-${n}`] ?? headers[`webhook-${n}`] ?? headers[`svix-${n}`];
  const id = get('id');
  const timestamp = get('timestamp');
  const signature = get('signature');
  if (!id || !timestamp || !signature) return false;
  if (!/^[1-9]\d*$/.test(timestamp)) return false; // plain positive integer
  if (toleranceSeconds !== null && Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;

  let key;
  if (secret.startsWith('whsec_')) {
    const b64 = secret.slice('whsec_'.length);
    if (!B64.test(b64)) return false;
    key = Buffer.from(b64, 'base64');
  } else {
    key = Buffer.from(secret, 'utf8');
  }

  const expected = createHmac('sha256', key)
    .update(Buffer.concat([Buffer.from(`${id}.${timestamp}.`), Buffer.from(rawBody)]))
    .digest();
  return signature.split(' ').some((entry) => {
    const [version, b64] = entry.split(',');
    if (version !== 'v1' || !b64 || !B64.test(b64)) return false;
    const sig = Buffer.from(b64, 'base64');
    return sig.length === expected.length && timingSafeEqual(sig, expected);
  });
}
```

```python
import base64, binascii, hashlib, hmac, re, time

def verify_sent(raw_body: bytes, headers, secret: str, tolerance_seconds=300) -> bool:
    h = {k.lower(): v for k, v in headers.items()}
    get = lambda n: h.get(f"x-webhook-{n}") or h.get(f"webhook-{n}") or h.get(f"svix-{n}")
    msg_id, timestamp, signature = get("id"), get("timestamp"), get("signature")
    if not (msg_id and timestamp and signature) or not re.fullmatch(r"[1-9]\d*", timestamp):
        return False
    if tolerance_seconds is not None and abs(time.time() - int(timestamp)) > tolerance_seconds:
        return False
    try:
        key = (base64.b64decode(secret[len("whsec_"):], validate=True)
               if secret.startswith("whsec_") else secret.encode())
    except (binascii.Error, ValueError):
        return False
    expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()
    for entry in signature.split():
        version, _, b64 = entry.partition(",")
        if version != "v1":
            continue
        try:
            if hmac.compare_digest(base64.b64decode(b64, validate=True), expected):
                return True
        except (binascii.Error, ValueError):
            continue
    return False
```

## Common Gotchas

- **Raw body:** compute the HMAC over the exact bytes received. Parsing and re-serialising the JSON changes whitespace or key order. In Express use `express.raw({ type: '*/*' })`, in Next.js `await request.arrayBuffer()`, in FastAPI `await request.body()`. Parse only after the check.
- **Decode the key:** the HMAC key is the base64-decoded secret *after* `whsec_`. Using the secret string itself is the most common failure.
- **`X-Webhook-ID` is not an event id:** it is the webhook's UUID and is identical on every event, but it is still part of the signed content. Dedupe on `X-Webhook-Event-ID`. Don't dedupe on `X-Webhook-Timestamp` either, which differs between attempts.
- **Several signatures:** split the header on spaces and accept a match against any entry.
- **Mapped header names:** the `standardwebhooks` library silently fails if you pass `x-webhook-*` keys. Pass `webhook-id`, `webhook-timestamp` and `webhook-signature`.
- **Clones share the secret:** a Sender Profile clone of your webhook is signed with your webhook's secret, but with its own `X-Webhook-ID`.
- **Response codes:** `400` missing headers, `401` bad signature or stale timestamp, `503` no secret configured. Never echo the signature or secret in a response or log line.

## How to Debug Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always fails | HMAC keyed with the undecoded secret, or `whsec_` left in the key |
| Library says missing headers | `x-webhook-*` headers not mapped to `webhook-*` |
| Fails on some requests only | Body re-serialised by a JSON parser |
| Fails only on retries behind Hookdeck | Library's 5-minute window vs the original timestamp: use the manual verifier |
| Timestamp error | Server clock skew over 5 minutes |
| Fails after rotating the secret | Old secret still deployed; clones update with the rotation |

Use **Test Webhook** in the dashboard to send a signed sample, and log the received headers and raw body length.
