# How to Verify incident.io Webhook Signatures

## How Does incident.io Sign Webhooks?

incident.io's docs say: "To verify that a webhook came from incident.io, check the signature in the
request headers using the Signing secret from your webhook endpoint settings." Delivery runs on Svix and
follows the Standard Webhooks spec, with `webhook-` header names (never `svix-`):

| Header | Example | Contents |
|--------|---------|----------|
| `webhook-id` | `123` | Unique message id. Use it to deduplicate |
| `webhook-timestamp` | `1676033031` | Unix time in **seconds** (integer string) |
| `webhook-signature` | `v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=` | Space-delimited list of `v1,<base64>` entries |

1. **Signed content**: `"{webhook-id}.{webhook-timestamp}."` followed by the raw request body bytes.
   The dot after the timestamp belongs to the prefix.
2. **Key**: if the Signing secret starts with `whsec_`, strip the prefix and base64-decode the rest.
   Otherwise use the secret's UTF-8 bytes. Reject a secret that decodes to zero bytes.
3. **Digest**: HMAC-SHA256 of the signed content, encoded as standard (padded) base64. Not hex, not
   base64url.
4. **Compare**: split `webhook-signature` on spaces, keep entries whose version tag is exactly `v1`, and
   accept if any of them equals the expected digest in a constant-time comparison. During a secret
   rotation more than one entry is present.

There is no handshake, challenge or bearer token. Return 2xx once the request verifies.

## Why Verify by Hand Instead of Using the Svix Library?

incident.io's docs point to the Svix client libraries or manual verification. Svix's `Webhook` class and
the `standardwebhooks` package both work if you map the headers correctly, but:

- incident.io has no SDK of its own, so there's nothing provider-specific to gain.
- Both libraries reject timestamps more than 5 minutes from now, and the window can't be changed (see
  below).
- They base64-decode any secret by default; an unprefixed secret is only used as raw bytes if you pass
  `{ format: 'raw' }` (JS), so one code path doesn't handle both forms.

The examples implement the steps above directly (about 20 lines per language). If the 5-minute window is
acceptable to you, the libraries are a valid alternative:

```javascript
import { Webhook } from 'standardwebhooks';
new Webhook(secret).verify(rawBody, { // strips whsec_ and base64-decodes
  'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': sig,
}); // throws on a bad signature or a timestamp outside 5 minutes
```

## Manual Verification

### Node.js (Express / Next.js)

```javascript
import crypto from 'node:crypto';

export function secretToKey(secret) {
  if (!secret) return null;
  if (!secret.startsWith('whsec_')) return Buffer.from(secret, 'utf8');
  const encoded = secret.slice('whsec_'.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null; // Buffer.from is lenient
  const key = Buffer.from(encoded, 'base64');
  return key.length > 0 ? key : null;
}

// toleranceSeconds: null skips the replay window
export function verifyIncidentIo(rawBody, id, timestamp, signature, key, toleranceSeconds = null) {
  if (!id || !timestamp || !signature || !/^[1-9]\d*$/.test(timestamp)) return false;
  if (toleranceSeconds !== null && Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) {
    return false;
  }
  const expected = Buffer.from(
    crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest('base64')
  );
  return signature.split(' ').some((entry) => {
    const comma = entry.indexOf(',');
    if (comma === -1 || entry.slice(0, comma) !== 'v1') return false;
    const received = Buffer.from(entry.slice(comma + 1)); // compare base64 text, don't decode
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}
```

### Python (FastAPI)

```python
import base64, binascii, hashlib, hmac, re, time
from typing import Optional

POSITIVE_INT_RE = re.compile(r"[1-9][0-9]*")

def secret_to_key(secret: Optional[str]) -> Optional[bytes]:
    if not secret:
        return None
    if not secret.startswith("whsec_"):
        return secret.encode("utf-8")
    try:
        key = base64.b64decode(secret[len("whsec_"):], validate=True)
    except (binascii.Error, ValueError):
        return None
    return key or None

def verify_incident_io(raw_body: bytes, msg_id: str, timestamp: str, signature: str,
                       key: bytes, tolerance_seconds: Optional[int] = None) -> bool:
    if not (msg_id and timestamp and signature) or not POSITIVE_INT_RE.fullmatch(timestamp):
        return False
    if tolerance_seconds is not None and abs(int(time.time()) - int(timestamp)) > tolerance_seconds:
        return False
    signed = f"{msg_id}.{timestamp}.".encode("utf-8") + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest())
    for entry in signature.split(" "):
        version, _, received = entry.partition(",")
        # bytes on both sides: compare_digest raises TypeError for non-ASCII str
        if version == "v1" and hmac.compare_digest(received.encode("utf-8"), expected):
            return True
    return False
```

Get the raw body with `express.raw({ type: 'application/json' })`, `await request.arrayBuffer()` /
`await request.text()` in Next.js, or `await request.body()` in FastAPI.

## Should I Enforce a Timestamp Window?

It's optional. `webhook-timestamp` is part of the signed content, so changing it breaks the signature. A
window only limits how long someone holding a captured, valid request could replay it.

The trade-off: incident.io retries failed deliveries with backoff for 24 hours, and it doesn't document
whether each retry carries a fresh timestamp. Anything that holds a request and delivers it later with
the original headers (a Hookdeck retry or replay, your own queue) arrives with the original timestamp.
A strict 5-minute window turns those legitimate deliveries into 400s.

The examples therefore:

- always check that `webhook-timestamp` is a plain positive integer string;
- skip the window unless `INCIDENT_IO_WEBHOOK_TOLERANCE_SECONDS` is set (for example `86400`);
- leave replay protection to deduplication on `webhook-id`.

## Common Gotchas

- **Raw body only.** Parsing JSON and re-serializing it changes bytes. Verify first, parse second.
- **Trailing dot.** The signed prefix is `${id}.${timestamp}.` and the body follows directly.
- **Header prefix.** The headers are `webhook-*`. Code that reads `svix-id` etc. finds nothing.
- **Base64, not hex.** The digest is standard padded base64.
- **Multiple signatures.** Split on spaces and accept any `v1` match; don't compare the whole header.
- **Version tag must be exactly `v1`.** Ignore other versions instead of stripping a prefix loosely.
- **Compare text, not decoded bytes.** Lenient base64 decoders skip junk characters, so a valid digest with
  extra characters appended could pass a decoded comparison.
- **One secret per endpoint.** A secret from another endpoint won't verify.
- **Data location.** After verifying, the resource is `body[body.event_type]`, not `body.data`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "Invalid signature" | Wrong or other endpoint's secret, or the body was parsed/re-serialized before verifying |
| Fails only with a `whsec_` secret | The secret was used as literal text instead of base64-decoded after the prefix |
| "Missing required webhook headers" | A proxy stripped `webhook-*` headers, or the code reads `svix-*` names |
| "Timestamp outside tolerance window" on retries or replays | The window is too tight; widen it or unset it and deduplicate on `webhook-id` |
| "Timestamp outside tolerance window" on fresh events | Server clock drift |
| Verifies, then `TypeError` reading `.name` | A `private_*` event: the resource is only `{ "id": ... }` |
