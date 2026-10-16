# Verifying Whatnot Webhooks

## The Scheme

| | |
|---|---|
| Header | `X-Whatnot-Webhook-Signature` |
| Algorithm | HMAC-SHA256 |
| Key | Your app's webhook secret key, used as UTF-8 |
| Signed content | The raw request body, exactly as received |
| Encoding | Lowercase hex (64 characters), no prefix |
| Timestamp | None. Nothing besides the body is signed |

From Whatnot's docs: "The signature is calculated using the HMAC SHA256
algorithm with the request body and your app's webhook key." Whatnot's sample
code uses `.hexdigest()`, which fixes the encoding as hex.

Hookdeck's `WHATNOT` source type implements the same scheme (HMAC-SHA256,
`encoding: 'hex'`, header `x-whatnot-webhook-signature`, raw body, no
timestamp prefix), which is an independent confirmation.

## Whatnot's Sample

From the overview page (rendered client-side, so open it in a browser):

```python
import hashlib
import hmac

def validate_webhook(raw_request_body, signature, secret):
    calculated_signature = hmac.new(
      bytes(secret, 'utf-8'),
      bytes(raw_request_body, 'utf-8'),
      hashlib.sha256
    ).hexdigest()

    return calculated_signature == signature
```

Two things to change when you adapt it:

1. **Constant-time comparison.** `==` can leak timing information. Use
   `hmac.compare_digest`.
2. **Work on bytes.** The sample takes the body as a `str` and re-encodes it.
   Most frameworks give you bytes already (`await request.body()` in
   FastAPI), so HMAC those directly and skip the decode/encode round trip.

## Node.js

```javascript
const crypto = require('crypto');

function verifyWhatnotSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const received = signature.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
}
```

The format check runs first because `crypto.timingSafeEqual` throws when the
buffers differ in length. An uncaught throw becomes a 500, which Whatnot then
retries.

## Python

```python
import hashlib, hmac, re

_HEX_SHA256 = re.compile(r"^[0-9a-f]{64}$")

def verify_whatnot_signature(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    if not signature or not secret:
        return False
    received = signature.strip().lower()
    if not _HEX_SHA256.match(received):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(received, expected)
```

## Getting the Raw Body

| Framework | How |
|---|---|
| Express | `express.raw({ type: '*/*' })` on the webhook route, then `req.body` is a `Buffer` |
| Next.js (App Router) | `await request.text()` before any `JSON.parse` |
| FastAPI | `await request.body()` |

Don't put `express.json()` (or any JSON body parser) in front of the webhook
route. Re-serializing parsed JSON doesn't reproduce Whatnot's bytes reliably.

## Test Vector

Computed with Whatnot's own sample above. The examples' tests use it.

```
secret    : whatnot_test_webhook_secret
body      : {"id":"00000000-0000-4000-8000-000000000001","timestamp":"2026-10-16T12:00:00Z","topic":"livestream/stopped","object":{"livestream_id":"example-livestream-id"}}
signature : 8c8bbd9060c6d9dcf6a7c0e7a29c409cdadbce1aed62394be99726573a19e4eb
```

The body is a single line with no trailing newline. The ID values are made
up.

## Debugging Failures

| Symptom | Likely cause |
|---|---|
| Every delivery fails | A JSON body parser ran before verification, or the secret is wrong or has stray whitespace |
| Fails only on some payloads | The body was re-serialized (non-ASCII characters, key order or whitespace changed) |
| Your digest is 44 characters ending in `=` | You produced base64. Whatnot uses hex |
| Signature header missing | The request didn't come from Whatnot, or a proxy stripped the header |
| 500s on bad signatures | `timingSafeEqual` threw on a length mismatch. Check the format first |

To check your secret, compute the HMAC of a captured raw body (the Hookdeck
CLI's web UI shows it) and compare against the header value.

## What Whatnot Doesn't Provide

- **No timestamp header or tolerance window.** A captured delivery could be
  resent unchanged. Dedupe on the envelope `id`.
- **No source IP allowlist** is documented.
- **No handshake or verification challenge** when a subscription is created.
- **No SDK helper** for verification.
