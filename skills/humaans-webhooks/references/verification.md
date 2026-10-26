# How to Verify Humaans Webhook Signatures

## How Does Humaans Sign Webhooks?

Humaans webhooks are delivered through Svix and follow the [Standard Webhooks](https://www.standardwebhooks.com/) scheme. Each delivery has:

| Header | Description |
|--------|-------------|
| `webhook-id` | Message ID; the same on every retry of an event |
| `webhook-timestamp` | Unix timestamp in seconds of this delivery attempt |
| `webhook-signature` | `v1,<base64>`; several space-delimited entries may appear (e.g. during secret rotation) |

Svix can send the same three values with a `svix-` prefix (`svix-id`, `svix-timestamp`, `svix-signature`) instead. Accept either.

The signature is `base64(HMAC-SHA256(key, "{id}.{timestamp}.{raw body}"))`, where `key` is the **base64-decoded** part of the secret after the `whsec_` prefix (e.g. `whsec_vwbddlgH8lyKqHEDzn3EUpmk`).

## Implementation

### Library (recommended)

```javascript
// npm install standardwebhooks
const { Webhook } = require('standardwebhooks');
const header = (name) => req.headers[`webhook-${name}`] ?? req.headers[`svix-${name}`];
const event = new Webhook(process.env.HUMAANS_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': header('id'),
  'webhook-timestamp': header('timestamp'),
  'webhook-signature': header('signature'),
}); // throws on bad signature or a timestamp more than 5 minutes off
```

```python
# pip install standardwebhooks
from standardwebhooks.webhooks import Webhook
h = lambda name: headers.get(f"webhook-{name}") or headers.get(f"svix-{name}")
event = Webhook(secret).verify(raw_body, {"webhook-id": h("id"), "webhook-timestamp": h("timestamp"), "webhook-signature": h("signature")})
```

The library takes the full `whsec_...` secret and returns the parsed payload. The `svix` library works too (it accepts both header prefixes) but is ESM-only in 2.x.

### Why the library can reject Hookdeck retries and replays

`standardwebhooks` and `svix` always enforce a fixed 5-minute window between `webhook-timestamp` and the current time. Hookdeck retries and replays resend the **original** `webhook-timestamp`, so a retry or replay that arrives more than 5 minutes after the first attempt fails verification even though the signature is valid. If you receive through Hookdeck, use the manual verifier below and drop the window (or widen it to what you can tolerate).

### Manual (Node, window optional)

```javascript
const crypto = require('crypto');

// maxAgeSeconds: 0 disables the timestamp check; e.g. 300 reproduces the library window.
function verifyHumaansSignature(headers, rawBody, secret, maxAgeSeconds = 0) {
  const get = (name) => headers[`webhook-${name}`] ?? headers[`svix-${name}`];
  const id = get('id'), timestamp = get('timestamp'), signatures = get('signature');
  if (!id || !timestamp || !signatures || !secret.startsWith('whsec_')) return false;
  if (maxAgeSeconds > 0) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > maxAgeSeconds) return false;
  }
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${timestamp}.`, 'utf8').update(rawBody).digest();
  return signatures.split(' ').some((entry) => {
    const [version, sig = ''] = entry.split(',');
    if (version !== 'v1') return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}
```

`rawBody` is the `Buffer` or string exactly as received.

### Manual (Python, window optional)

```python
import base64, binascii, hashlib, hmac, time

def verify_humaans(headers: dict, raw_body: bytes, secret: str, max_age_seconds: int = 0) -> bool:
    get = lambda name: headers.get(f"webhook-{name}") or headers.get(f"svix-{name}")
    msg_id, timestamp, signatures = get("id"), get("timestamp"), get("signature")
    if not (msg_id and timestamp and signatures and secret.startswith("whsec_")):
        return False
    if max_age_seconds > 0:
        try:
            if abs(time.time() - int(timestamp)) > max_age_seconds:
                return False
        except ValueError:
            return False
    key = base64.b64decode(secret[len("whsec_"):])
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = hmac.new(key, signed, hashlib.sha256).digest()
    for entry in signatures.split(" "):
        version, _, sig = entry.partition(",")
        if version != "v1":
            continue
        try:
            given = base64.b64decode(sig, validate=True)
        except (binascii.Error, ValueError):
            continue
        if hmac.compare_digest(given, expected):
            return True
    return False
```

Comparing the decoded bytes keeps `hmac.compare_digest` away from non-ASCII `str` input, which would raise `TypeError`.

## Common Gotchas

- **Use the raw body.** Parse JSON only after verifying; re-serialized JSON changes the bytes. In Express use `express.raw({ type: '*/*' })` so any content type is read raw.
- **Decode the key.** The HMAC key is the base64-decoded bytes after `whsec_`, not the secret string itself.
- **Multiple signatures.** Check every space-delimited `v1,` entry; any match is valid. Humaans' own sample strips `v1,` and compares a single value, which fails during secret rotation.
- **Header prefix.** Accept `webhook-*` and `svix-*`.
- **Replay protection vs retries.** The libraries force a 5-minute window. Behind Hookdeck, retries and replays carry the original timestamp, so use the manual verifier and choose your own window. Deduplicate on `webhook-id` instead.
- **Retries keep the same `webhook-id`.** Use it as the idempotency key.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Body parsed before verifying, or the secret wasn't base64-decoded |
| Invalid after a proxy/middleware | Middleware modified or re-encoded the body |
| Missing header error | Only `svix-*` headers were read; accept both prefixes |
| "Message timestamp too old" | Clock skew, or a Hookdeck retry/replay older than 5 minutes; switch to the manual verifier |
| Endpoint disabled | Five days of failures; fix the receiver and re-enable the webhook |
