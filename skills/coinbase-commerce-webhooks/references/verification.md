# How to Verify Coinbase Commerce Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is public. Without verification, anyone could POST a fake
`charge:confirmed` event and trick your app into fulfilling an unpaid order.
Coinbase Commerce signs every webhook so you can prove it's authentic before
acting on it.

## How It Works

- **Header:** `X-CC-Webhook-Signature`
- **Algorithm:** HMAC-SHA256
- **Encoding:** hexadecimal
- **Signed content:** the **raw request body bytes** (exactly as received)
- **Key:** your webhook **shared secret** (Settings → Notifications)

The header contains the expected hex digest. You compute the HMAC-SHA256 of the
raw body with your shared secret and compare it to the header using a
**timing-safe** comparison.

## Implementation

### SDK Verification (Node.js — preferred)

The official [`coinbase-commerce-node`](https://www.npmjs.com/package/coinbase-commerce-node)
SDK exposes `Webhook.verifyEventBody`:

```javascript
const { Webhook } = require('coinbase-commerce-node');

try {
  // Returns the verified event object; throws on an invalid signature.
  const event = Webhook.verifyEventBody(
    rawBody,        // raw request body STRING (not parsed JSON)
    signature,      // req.headers['x-cc-webhook-signature']
    sharedSecret    // process.env.COINBASE_COMMERCE_WEBHOOK_SECRET
  );
  console.log(event.type); // e.g. "charge:confirmed"
} catch (err) {
  // err instanceof Webhook errors.SignatureVerificationError / WebhookInvalidPayload
  // -> respond 400
}
```

The SDK also exposes lower-level helpers:

- `Webhook.verifySigHeader(rawBody, signature, sharedSecret)` — throws `SignatureVerificationError` if the signature is invalid, otherwise returns `true`.
- `Webhook.computeSignature(rawBody, sharedSecret)` — returns the hex HMAC-SHA256 digest.

### Manual Verification (fallback — e.g. Python / FastAPI)

Coinbase Commerce also publishes a Python SDK (`coinbase-commerce`), but it is
unmaintained and not idiomatic for FastAPI. The algorithm is simple enough to
implement directly:

```python
import hmac, hashlib

def verify(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # compare_digest is timing-safe and handles length mismatches
    return hmac.compare_digest(expected, signature or "")
```

Equivalent in Node without the SDK:

```javascript
const crypto = require('crypto');

function verify(rawBody, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ''));
  } catch {
    return false; // length mismatch => invalid
  }
}
```

## Common Gotchas

- **Use the raw body.** Verify against the exact bytes received. If a framework
  parses JSON and you re-`JSON.stringify` it, key order and whitespace change and
  the signature will never match. In Express use `express.raw()`; in Next.js use
  `await request.text()`; in FastAPI use `await request.body()`.
- **The event is nested under `event`.** The signed payload is the whole body;
  the event data lives at `body.event`, not the top level.
- **Header casing.** HTTP headers are case-insensitive. Frameworks lowercase
  them, so read `x-cc-webhook-signature`.
- **hex, not base64.** The digest is hex-encoded. Don't base64-decode it.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`,
  never `==`.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Always 400 / signature never matches | Body was parsed/re-serialized before verifying — use the raw body |
| Works locally, fails behind a proxy | Proxy or middleware mutated the body; verify before any body transform |
| `TypeError` on comparison | `signature` header missing (`undefined`); check the header exists first |
| Matches sometimes | Multiple endpoints share a shared secret mismatch — confirm the secret matches this endpoint |
