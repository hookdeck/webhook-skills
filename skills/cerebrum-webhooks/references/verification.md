# How to Verify Cerebrum Webhook Signatures

## How Does Cerebrum Sign Webhooks?

Cerebrum delivers through Svix, which follows [Standard Webhooks](https://www.standardwebhooks.com/) with `svix-*` header names:

| Header | Value |
|--------|-------|
| `svix-id` | Unique message ID, the same on every retry of that message |
| `svix-timestamp` | Unix timestamp (seconds) of this delivery attempt |
| `svix-signature` | Space-separated list of `v1,<base64 signature>` entries |

```
key       = base64_decode(secret without the "whsec_" prefix)
content   = "{svix-id}.{svix-timestamp}.{raw request body}"
signature = base64(HMAC-SHA256(key, content))
```

The request is valid when any `v1,` entry matches. Entries with other versions (such as `v1a`) are ignored.

### The `webhook-*` header fallback

The same three values can arrive as `webhook-id`, `webhook-timestamp` and `webhook-signature`. Hookdeck reads the `svix-*` set and falls back to `webhook-*` when `svix-id` is absent. The examples do the same: they pick one complete set, then hand the three values to the verifier. A delivery signed identically but sent with the other prefix's headers verifies.

## Why Does Signature Verification Matter?

Your `postbackWebhookUrl` is public. Without verification anyone can POST a fake `ORDER_STATUS_CHANGE` or `VOUCHER_REDEEMED` and have your system act on a background-check result that never happened.

## Implementation

### Library Verification (recommended)

Use the official `svix` library ([npm](https://www.npmjs.com/package/svix), [PyPI](https://pypi.org/project/svix/)). `Webhook.verify` reads `svix-id`, `svix-timestamp`, `svix-signature` (it also accepts the `webhook-*` names itself), recomputes the HMAC over the raw body and compares in constant time.

```javascript
import { Webhook } from 'svix';

// rawBody: the exact request body string, NOT re-serialised JSON
function verifyCerebrum(rawBody, get /* (name) => header value */, secret) {
  const prefix = get('svix-id') ? 'svix' : 'webhook';
  const headers = {
    'svix-id': get(`${prefix}-id`),
    'svix-timestamp': get(`${prefix}-timestamp`),
    'svix-signature': get(`${prefix}-signature`),
  };
  if (Object.values(headers).some((v) => !v)) throw new Error('Missing signature headers');
  new Webhook(secret).verify(rawBody, headers); // svix 2.x returns nothing; throws on failure
  return JSON.parse(rawBody);
}
```

```python
import json
from svix.webhooks import Webhook

def verify_cerebrum(raw_body: bytes, headers, secret: str) -> dict:
    prefix = "svix" if headers.get("svix-id") else "webhook"
    picked = {
        "svix-id": headers.get(f"{prefix}-id"),
        "svix-timestamp": headers.get(f"{prefix}-timestamp"),
        "svix-signature": headers.get(f"{prefix}-signature"),
    }
    if not all(picked.values()):
        raise ValueError("Missing signature headers")
    Webhook(secret).verify(raw_body, picked)  # raises WebhookVerificationError
    return json.loads(raw_body)
```

`svix` 2.x on npm is ESM-only and needs Node 22+.

The library **always rejects a timestamp more than 5 minutes from the current time**, and the window can't be turned off. Hookdeck retries and replays resend the original timestamp, so a delivery replayed later than 5 minutes after it was first sent fails the library check. If you receive through Hookdeck (or replay old events), use the manual verifier below.

### Manual Verification (no timestamp window)

Drop or widen the window by verifying yourself. This checks the `{id}.{timestamp}.{raw body}` HMAC, requires the timestamp to be a plain positive integer, compares **every** `v1,` entry in constant time after a length check, and applies a window only if you pass one.

```javascript
import crypto from 'node:crypto';

function verifyCerebrumManual(rawBody, id, timestamp, signatureHeader, secret, toleranceSeconds) {
  if (!/^[1-9]\d*$/.test(timestamp)) return false;
  if (toleranceSeconds != null && Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  let valid = false;
  for (const entry of signatureHeader.split(' ')) {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) continue;
    const received = Buffer.from(sig, 'base64');
    if (received.length === expected.length && crypto.timingSafeEqual(received, expected)) valid = true;
  }
  return valid;
}
```

```python
import base64, hashlib, hmac, re, time

def verify_cerebrum_manual(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
                           secret: str, tolerance_seconds=None) -> bool:
    if not re.fullmatch(r"[1-9][0-9]*", timestamp):
        return False
    if tolerance_seconds is not None and abs(time.time() - int(timestamp)) > tolerance_seconds:
        return False
    key = base64.b64decode(secret[len("whsec_"):]) if secret.startswith("whsec_") else secret.encode()
    expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()
    valid = False
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version != "v1" or not sig:
            continue
        try:
            received = base64.b64decode(sig, validate=True)
        except ValueError:
            continue
        if len(received) == len(expected) and hmac.compare_digest(received, expected):
            valid = True
    return valid
```

Pass `300` as the tolerance to match the library, a larger number to cover Hookdeck retries, or `null`/`None` for no window (retries and replays are then bounded only by your idempotency checks).

## Common Gotchas

- **Raw body.** The HMAC covers the exact bytes Cerebrum sent. Use `express.raw({ type: '*/*' })`, `await request.text()` or `await request.body()`, and parse JSON only after verification.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string. `CEREBRUM_WEBHOOK_SECRET` holds the full `whsec_` value.
- **Multiple signatures.** A rotation can put several space-separated entries in `svix-signature`. Accept the request if any `v1,` entry matches.
- **Header prefix.** Read `svix-*` first and `webhook-*` only when `svix-id` is absent. Don't mix sets.
- **The 5-minute window and Hookdeck.** Retries and replays keep the original timestamp (see above).
- **Fail closed.** If the secret env var is unset, reject (the examples return `500`) rather than skipping verification.
- **Deduplicate.** Retries share the same `svix-id`.

## How Do I Debug Cerebrum Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong secret, `whsec_` prefix not stripped or key not base64-decoded, or the body was parsed before verification |
| Fails only for retries or replays | The 5-minute timestamp window; use the manual verifier |
| Fails only for some deliveries | A different webhook's secret (one secret per webhook) |
| Missing headers | A proxy stripped `svix-*` headers, or the request isn't from Cerebrum or Hookdeck |

Inspect the delivery and its attempts in the Svix Portal, and replay it after fixing the handler.
