# How to Verify SignNow Webhook Signatures

## How It Works

When an event subscription has a `secret_key`, every callback carries:

```
X-SignNow-Signature: <base64 HMAC-SHA256 of the raw body>
```

- Algorithm: HMAC-SHA256
- Key: the `secret_key` as a UTF-8 string
- Signed content: the raw request body only (no timestamp, no id)
- Encoding: **base64** (not hex)

SignNow's own example hashes with `hash_hmac('sha256', payload, secret)` and
base64-encodes the result. It does not use Standard Webhooks.

## Implementation

SignNow ships no webhook verification helper, so verify manually.

```javascript
const crypto = require('crypto');

function verifySignNowSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(rawBody).digest('base64');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

```python
import base64, hashlib, hmac

def verify_signnow_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("ascii")
    return hmac.compare_digest(signature.encode(), expected.encode())
```

Full handlers: [express](../examples/express/), [nextjs](../examples/nextjs/), [fastapi](../examples/fastapi/).

## Common Gotchas

- **No `secret_key`, no signature.** Unsigned callbacks have no
  `X-SignNow-Signature` header. Set a secret on the subscription.
- **Raw body.** Sign the exact bytes. In Express use
  `express.raw({ type: '*/*' })` so any Content-Type is captured; with
  `express.json()` the re-serialized body won't match.
- **Base64, not hex.** A hex digest will never match.
- **Secret as UTF-8 text.** Don't base64-decode or strip it.
- **No timestamp in the signature.** Replays can't be rejected by age, so
  dedupe deliveries yourself (retries repeat the same payload).
- **4xx responses count against you.** Returning 400 for every failed check
  while misconfigured can get the subscription unsubscribed (30 errors in 60
  minutes). Fix the secret quickly.

## Debugging Verification Failures

1. Is the header present? If not, the subscription has no `secret_key`
   (`GET /v2/event-subscriptions` shows it).
2. Does your secret match the subscription exactly (whitespace, copy errors)?
3. Are you hashing the raw bytes, before any JSON parsing or middleware?
4. Is the digest base64?
5. Check **Events History** in the API Dashboard for the response code and
   body your endpoint returned.
