# How to Verify Deliverect Webhook Signatures

## How Does Deliverect Sign Requests?

From the [HMAC Authentication](https://developers.deliverect.com/reference/hmac-authentication) page:
Deliverect hashes the request payload with SHA-256 to produce a hex-encoded HMAC, sent in the
`x-server-authorization-hmac-sha256` header, keyed with a pre-shared secret.

| Item | Value |
|------|-------|
| Header | `x-server-authorization-hmac-sha256` |
| Algorithm | HMAC-SHA256 |
| Encoding | Hex, the bare digest with no prefix |
| Signed content | The raw request body bytes only |
| Key | The secret's UTF-8 bytes (not decoded) |
| Timestamp | None signed, so no replay window |
| Standard Webhooks | No |

Compare the **whole header value** as one digest: no list splitting and no prefix parsing.
The docs' example header is masked (`65060aeeee…eeebdad3196e9d7`).

## Which Secret?

Staging before certification: the call's `channelLink`, or `locationId` for Dispatch API integrations
and the POS Get Products webhook. Production: the secret generated in Integration settings.

## Implementation

Neither Deliverect nor this skill uses an SDK; verification is manual.

### Node.js

```javascript
const crypto = require('crypto');

function verifyDeliverectSignature(rawBody, signature, secret = process.env.DELIVERECT_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string') return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

### Python

```python
import hashlib, hmac, re

def verify_deliverect_signature(raw_body: bytes, signature, secret) -> bool:
    if not secret or not isinstance(signature, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature), expected)  # bytes, never str
```

Hex is accepted case-insensitively (as Hookdeck does): the format check requires exactly 64 hex
characters, then both sides are compared as bytes in constant time.

## Common Gotchas

- **GET requests have no body.** The HMAC is over the empty string, so verify over zero bytes. In
  Express, `req.body` is `undefined` when there is no body: use an empty Buffer. A verified GET is
  acknowledged with `200`, not rejected as invalid JSON.
- **Raw bytes only.** Do not `JSON.parse`/`JSON.stringify`, trim, or decode and re-encode the body
  before verifying; whitespace or key order changes break the HMAC. In Express use
  `express.raw({ type: '*/*' })`; Express skips body parsing when a request has a body but no
  `Content-Type`, so make sure senders (and tests) set one.
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops bad characters, so check
  length and alphabet first, as above.
- **Pre-certification secret.** If production verification works but staging fails (or the reverse),
  you are probably using the wrong secret for that environment.
- **Allow all methods** on the route and on the Hookdeck source; verification applies to every method.
- **No replay protection.** Nothing time-based is signed; do not invent a window from unsigned
  headers or body fields. Make handlers idempotent instead.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| `401` on every request | Wrong secret (staging vs production), or `DELIVERECT_WEBHOOK_SECRET` unset |
| `401` only on GET calls | Verifying over a parsed or `undefined` body instead of zero bytes |
| `401` only on some POSTs | Body modified before verification (parsed, trimmed, re-encoded) |
| GET calls never arrive via Hookdeck | The source only allows POST; also allow GET |
| `400` after a valid signature | Body is not a JSON object |
