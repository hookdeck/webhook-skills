# How to Verify Fiber AI Webhook Signatures

## How It Works

Fiber AI delivers through Svix. Each request has:

| Header | Meaning |
|--------|---------|
| `svix-id` | Message id, stable across retries |
| `svix-timestamp` | Unix seconds when the attempt was signed |
| `svix-signature` | One or more space-separated `v1,<base64>` entries |

Signature = base64(`HMAC-SHA256`(key, `"{svix-id}.{svix-timestamp}.{raw body}"`)), where
key = base64-decode of the secret after the `whsec_` prefix. The raw bytes of the body
are signed, so verify before parsing. During a secret rotation grace period the header can
carry signatures for both secrets; any one matching is enough.

## Implementation

### Official library (recommended)

```javascript
import { Webhook } from 'svix';
new Webhook(process.env.FIBER_AI_WEBHOOK_SECRET).verify(rawBody, {
  'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sig,
}); // throws on failure; svix 2.x returns nothing, so JSON.parse the raw body afterwards
```

```python
from svix.webhooks import Webhook
Webhook(secret).verify(raw_body, {"svix-id": i, "svix-timestamp": t, "svix-signature": s})
```

The library (like `standardwebhooks`) always rejects a timestamp more than 5 minutes from
now, in either direction. That cannot be disabled.

### Manual verification (no timestamp window, or a wider one)

Why you might need it: Hookdeck retries and replays resend the original `svix-timestamp`,
so after 5 minutes the library rejects them. Use this verifier when deliveries pass through
Hookdeck retries or replays. Dedupe on `svix-id` for replay protection, or pass `max_age`
to re-introduce a window of your own choosing (measured from when you received the request).

Node:

```javascript
import crypto from 'node:crypto';

export function verifyFiberAi(rawBody, headers, secret, maxAgeSeconds = null) {
  const id = headers['svix-id'];
  const ts = headers['svix-timestamp'];
  const sigHeader = headers['svix-signature'];
  if (!id || !ts || !sigHeader || !secret.startsWith('whsec_')) return false;
  if (!/^[1-9][0-9]*$/.test(ts)) return false;                   // reject a non-numeric timestamp
  if (maxAgeSeconds !== null && Math.abs(Date.now() / 1000 - Number(ts)) > maxAgeSeconds) return false;

  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${ts}.`).update(rawBody).digest();            // rawBody: Buffer or string

  // Check EVERY space-separated entry; do not stop at the first
  let ok = false;
  for (const entry of sigHeader.split(' ')) {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig || !/^[A-Za-z0-9+/]+={0,2}$/.test(sig)) continue; // strict base64 only
    const got = Buffer.from(sig, 'base64');
    if (got.length === expected.length && crypto.timingSafeEqual(got, expected)) ok = true;
  }
  return ok;
}
```

Python:

```python
import base64, hashlib, hmac, re, time

def verify_fiber_ai(raw_body: bytes, headers, secret: str, max_age_seconds=None) -> bool:
    msg_id, ts, sig_header = headers.get("svix-id"), headers.get("svix-timestamp"), headers.get("svix-signature")
    if not (msg_id and ts and sig_header and secret.startswith("whsec_")):
        return False
    if not re.fullmatch(r"[1-9][0-9]*", ts):  # reject a non-numeric timestamp
        return False
    if max_age_seconds is not None and abs(time.time() - int(ts)) > max_age_seconds:
        return False
    key = base64.b64decode(secret[len("whsec_"):])
    expected = hmac.new(key, f"{msg_id}.{ts}.".encode() + raw_body, hashlib.sha256).digest()
    ok = False
    for entry in sig_header.split(" "):
        version, _, sig = entry.partition(",")
        if version != "v1" or not sig:
            continue
        try:
            got = base64.b64decode(sig, validate=True)
        except ValueError:
            continue
        if hmac.compare_digest(got, expected):
            ok = True
    return ok
```

## Common Gotchas

- **Raw body.** Re-serialized JSON changes bytes and breaks the signature. In Express use `express.raw({ type: '*/*' })`; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Secret format.** Use the whole `whsec_...` string with the library; for manual code, base64-decode only the part after `whsec_`.
- **5-minute window vs Hookdeck retries/replays.** See above; use the manual verifier.
- **Multiple signatures.** Compare every `v1,` entry (rotation grace period).
- **Secret not stored.** It is shown only on create and rotate; if lost, rotate it.
- **Out-of-order delivery.** Order by `occurredAt`; dedupe on `svix-id` (and `eventId` for Tracker signals).

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `No matching signature found` | Wrong secret (or an old one past the grace period), or body was parsed/re-serialized |
| `Message timestamp too old` | Retry or replay older than 5 minutes (library window); use the manual verifier |
| `Missing required headers` | Request is not from Fiber AI/Svix, or a proxy stripped `svix-*` headers |
| Works for tests, fails live | Body middleware ran first (`express.json()`), or a content type that raw parsing skipped |
