# TutorCruncher Signature Verification

## How Does TutorCruncher Sign Webhooks?

| Item | Value |
|------|-------|
| Header | `Webhook-Signature` (Hookdeck's source reads `webhook-signature`) |
| Algorithm | HMAC-SHA256 |
| Key | The integration's private API key, as UTF-8 bytes, used as-is |
| Signed content | The raw request body bytes only |
| Encoding | Lowercase hex, no prefix |
| Timestamp / id | None |

The header name is the same as Standard Webhooks, but the value is a bare hex digest with no
`v1,` prefix, id or timestamp. Do not use a Standard Webhooks library.

TutorCruncher's own example:

```python
hmac.new(private_key.encode(), request.body, hashlib.sha256).hexdigest() == header_signature
```

## How Do I Verify It Safely?

1. Read the raw body as bytes. Never decode and re-encode it, and never `JSON.parse` /
   `JSON.stringify` before verifying.
2. Require a non-empty header that is exactly 64 hex characters. Anything else is `401`.
3. Compute the hex HMAC-SHA256 and compare it to the header in constant time. Hex is
   case-insensitive, so lowercase the header value first.
4. Only then parse the body.

### Node.js

```javascript
const crypto = require('crypto');

function verifyTutorCruncherSignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = Buffer.from(signature.toLowerCase(), 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return received.length === wanted.length && crypto.timingSafeEqual(received, wanted);
}
```

Don't call `Buffer.from(signature, 'hex')` on an unvalidated value: it silently drops bad
characters.

### Python

```python
import hashlib, hmac, re

def verify_tutorcruncher_signature(raw_body: bytes, signature, secret: str) -> bool:
    if not secret or not isinstance(signature, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.lower().encode("ascii"), expected.encode("ascii"))
```

## Common Gotchas

- **Raw body only.** A framework that parses JSON first changes the bytes. Use
  `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` or `await request.body()`.
- **The key is the private API key**, not a separate webhook secret, and not decoded.
- **Not Standard Webhooks.** There are no `webhook-id` or `webhook-timestamp` headers.
- **No replay protection.** Nothing time-based is signed. Make handlers idempotent instead
  (see webhook-handler-patterns).
- **Any HTTP method.** The docs don't name the method. Verify first for GET, POST, PUT, PATCH
  and DELETE and treat a missing body as zero bytes: a verified empty body gets `200`.
- **Several events per request.** Loop over `events`.

## Debugging Verification Failures

- Signature always fails: check `TUTORCRUNCHER_WEBHOOK_SECRET` is the integration's private API
  key, with no whitespace or quotes, and that the body is not parsed before the check.
- `401` for every request via Hookdeck: the source's key must be the same private API key.
- Works in tests but not live: a proxy or middleware is re-serialising the body.
- Compare against TutorCruncher's webhook logs, which show the request that was sent.
