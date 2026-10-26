# How to Verify Glean Webhook Signatures

## How Does Glean Sign Deliveries?

Glean follows Standard Webhooks:

- Headers: `webhook-id`, `webhook-timestamp` (Unix seconds), `webhook-signature` (`v1,<base64>`; Glean sends one today, the spec allows several space-delimited).
- Signed string: `{webhook-id}.{webhook-timestamp}.{raw body}`
- Algorithm: HMAC-SHA256, output base64-encoded.
- Key: the signing secret with `whsec_` removed, then base64-decoded.
- The signing secret is returned once by `POST /api/triggers`.

If the trigger has `delivery.auth` type `BEARER`, the request also carries
`Authorization: Bearer <secret>`. Check it as an additional gate.

## Library Verification (5-minute window)

`standardwebhooks` (npm / PyPI) and `svix` verify the signature, check every
`v1` entry in constant time, and **always** reject a `webhook-timestamp` more than
5 minutes from now. The window is fixed; it cannot be disabled or widened.

```javascript
const { Webhook } = require('standardwebhooks');
new Webhook(process.env.GLEAN_SIGNING_SECRET).verify(rawBody, {
  'webhook-id': req.headers['webhook-id'],
  'webhook-timestamp': req.headers['webhook-timestamp'],
  'webhook-signature': req.headers['webhook-signature'],
});
```

## Why Do Retries and Replays Fail After 5 Minutes?

Hookdeck retries and replays resend the original request, including the original
`webhook-timestamp`. A delivery retried or replayed more than 5 minutes after
Glean signed it still has a valid signature, but the library rejects it as stale.
Glean treats a 4xx other than 408/429 as terminal, so a stale rejection is not
retried further. Use the manual verifier below when you receive via Hookdeck,
replay events, or want a different window.

## Manual Verification (window configurable)

```javascript
const crypto = require('crypto');

// toleranceSeconds: null = no timestamp check; or e.g. 86400 to widen it.
function verifyGlean(rawBody, headers, signingSecret, toleranceSeconds = null) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatures = headers['webhook-signature'];
  if (!id || !timestamp || !signatures) return false;
  if (toleranceSeconds !== null) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) return false;
  }
  if (!signingSecret.startsWith('whsec_')) return false;
  const key = Buffer.from(signingSecret.slice('whsec_'.length), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${timestamp}.`).update(rawBody).digest();
  // Check every space-separated "v1,<base64>" entry, constant time.
  return String(signatures).split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const actual = Buffer.from(sig, 'base64');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  });
}
```

```python
import base64, hashlib, hmac, time

def verify_glean(raw_body: bytes, headers, signing_secret: str, tolerance_seconds=None) -> bool:
    msg_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    signatures = headers.get("webhook-signature")
    if not (msg_id and timestamp and signatures) or not signing_secret.startswith("whsec_"):
        return False
    if tolerance_seconds is not None:
        try:
            if abs(time.time() - int(timestamp)) > tolerance_seconds:
                return False
        except ValueError:
            return False
    key = base64.b64decode(signing_secret[len("whsec_"):])
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = hmac.new(key, signed, hashlib.sha256).digest()
    for part in signatures.split(" "):
        version, _, sig = part.partition(",")
        if version != "v1" or not sig:
            continue
        try:
            candidate = base64.b64decode(sig, validate=True)
        except ValueError:
            continue
        if hmac.compare_digest(candidate, expected):
            return True
    return False
```

Without a timestamp window, make handlers idempotent on `webhook-id` so a replayed
delivery does not repeat side effects.

## Common Gotchas

- **Raw body**: parsing and re-serializing JSON changes key order and whitespace. In Express use `express.raw({ type: '*/*' })` so any content type verifies.
- **Secret format**: keep the `whsec_` prefix in config; strip it only to derive the key. Do not use the prefixed string as the HMAC key.
- **Secret lost**: it cannot be read back; delete and recreate the trigger.
- **Bearer is extra**: a valid `Authorization: Bearer` header never substitutes for the signature.
- **Terminal 4xx**: Glean drops events on non-2xx responses other than 408, 429 and 5xx, so a failed verification loses that delivery.

## How to Debug Verification Failures

1. Log the three headers and the byte length of the raw body.
2. Confirm the secret starts with `whsec_` and is the one from the trigger's creation response.
3. Recompute with the manual verifier and `toleranceSeconds = null`. If that passes but the library fails, it is the 5-minute window (a retry or replay).
4. Ensure no middleware parsed the body first.
