# How to Verify Celitech Webhook Signatures

## How Does Celitech Sign Webhooks?

Celitech delivers through Svix using the Standard Webhooks signature scheme. Each
request includes:

| Header | Contents |
|--------|----------|
| `svix-id` | Unique message ID (also your idempotency key) |
| `svix-timestamp` | Attempt time, Unix seconds |
| `svix-signature` | Space-delimited list of `v1,<base64 signature>` entries |

Celitech's security page describes the construction only in prose (a signature over the
delivery's `svix-id`, `svix-timestamp`, and raw body) and points to the Svix libraries.
The algorithm below is the Svix one:

1. Build the signed content: `{svix-id}.{svix-timestamp}.{raw body}`.
2. Strip the `whsec_` prefix from the signing secret and base64-decode the rest.
3. Compute HMAC-SHA256 of the signed content with the decoded key.
4. Base64-encode the digest.
5. Compare it (constant time) against each `v1,` entry in `svix-signature`. Any match
   passes. Several entries appear during secret rotation. Ignore other versions (e.g. `v1a`).

## Which Headers Do I Read?

Read `svix-*`; when `svix-id` is absent, fall back to `webhook-id`, `webhook-timestamp`,
and `webhook-signature` (the Standard Webhooks names). Hookdeck's Celitech source does
the same. Then give the library the three values under the `svix-*` names, so it never
sees a mix of the two sets. The examples do this in `resolveSignatureHeaders` /
`resolve_signature_headers`, and their tests include a delivery sent with `webhook-*`
headers.

## SDK Verification (recommended)

The `svix` package (npm and PyPI) is the supported verifier. `Webhook.verify` throws on a
bad signature or on a timestamp more than 5 minutes from now.

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only

new Webhook(process.env.CELITECH_WEBHOOK_SECRET).verify(rawBody, {
  'svix-id': id,
  'svix-timestamp': timestamp,
  'svix-signature': signature,
});
```

```python
from svix.webhooks import Webhook, WebhookVerificationError

try:
    Webhook(os.environ["CELITECH_WEBHOOK_SECRET"]).verify(raw_body, {
        "svix-id": msg_id, "svix-timestamp": timestamp, "svix-signature": signature,
    })
except WebhookVerificationError:
    ...  # return 400
```

## Why Are Retries Rejected Through Hookdeck?

The library's 5-minute window is fixed. Hookdeck retries and replays resend the
original `svix-timestamp`, so a retry that reaches your server more than 5 minutes after
the original delivery fails with a timestamp error even though the signature is valid.
Hookdeck's own Celitech verification applies no timestamp window. If you receive through
Hookdeck, use the manual verifier below with the window dropped (or widened).

## Manual Verification (no timestamp window)

```javascript
import crypto from 'node:crypto';

// maxAgeSeconds = null drops the window; pass e.g. 86400 to widen it
function verifyCelitech(rawBody, id, timestamp, signatureHeader, secret, maxAgeSeconds = null) {
  if (!/^[1-9]\d*$/.test(timestamp)) return false; // plain positive integer only
  if (maxAgeSeconds !== null && Math.abs(Date.now() / 1000 - Number(timestamp)) > maxAgeSeconds) return false;

  // As Hookdeck does: whsec_ secrets are base64, anything else is used as raw UTF-8 bytes
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');
  if (key.length === 0) return false;
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.`)
    .update(rawBody) // Buffer or string: the exact bytes received
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

```python
import base64, hashlib, hmac, re, time

def verify_celitech(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str,
                    secret: str, max_age_seconds=None) -> bool:
    if not re.fullmatch(r"[1-9][0-9]*", timestamp):  # plain positive integer only
        return False
    if max_age_seconds is not None and abs(time.time() - int(timestamp)) > max_age_seconds:
        return False
    # As Hookdeck does: whsec_ secrets are base64, anything else is used as raw UTF-8 bytes
    key = base64.b64decode(secret[len("whsec_"):]) if secret.startswith("whsec_") else secret.encode("utf-8")
    if not key:
        return False
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig.encode(), expected.encode()):
            return True
    return False
```

If you drop the window, deduplicate on `svix-id` so a captured request can't be replayed
to trigger your handler twice.

## Common Gotchas

- **Raw body only.** Parsing JSON and re-serializing changes whitespace and key order.
  Use `express.raw({ type: '*/*' })`, `await request.text()` (Next.js), or
  `await request.body()` (FastAPI). Don't depend on the content type.
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not
  the literal string.
- **Multiple signatures.** Split `svix-signature` on spaces and accept any matching
  `v1,` entry. Don't compare the whole header.
- **One secret per endpoint.** A secret from a different endpoint won't verify.
- **Fail closed.** If the secret env var is unset, reject the request rather than skipping verification.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails with "Invalid signature" | Wrong secret (another endpoint's, or rotated), or body was parsed/re-serialized first |
| Fails only behind a proxy | A proxy or middleware rewrote the body or stripped `svix-*` headers |
| "Timestamp too old" on retries or replays | The library's fixed 5-minute window; use the manual verifier |
| "Timestamp too new" | Server clock drift |
| Missing headers | Something in front of your app dropped the signature headers |
