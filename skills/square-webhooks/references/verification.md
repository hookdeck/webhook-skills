# How to Verify Square Webhook Signatures

## Why Signature Verification Matters

Your Square webhook endpoint is a public HTTPS URL. Anyone can POST to it.
Signature verification proves a request genuinely came from Square (and was not
tampered with in transit) before you act on payment or refund data.

## How It Works

Square signs every webhook with an **HMAC-SHA256**:

- **Header:** `x-square-hmacsha256-signature`
- **Algorithm:** HMAC-SHA256
- **Encoding:** base64
- **Signed content:** the **notification URL** concatenated with the **raw
  request body** — `notificationUrl + rawBody` — in that order
- **Key:** the **signature key** from your webhook subscription

To verify, recompute the HMAC over `notificationUrl + rawBody` using your
subscription's signature key, base64-encode it, and compare it against the
header value using a constant-time (timing-safe) comparison.

> The notification URL is part of the signed content. It must be the **exact**
> URL registered on the subscription (scheme, host, and path), or the computed
> signature will not match.

## Implementation

### SDK Verification (Node — recommended)

The official Square SDK (`square`, v40+) ships `WebhooksHelper.verifySignature`,
which performs the concatenation, HMAC, and comparison for you and returns a
`Promise<boolean>`:

```javascript
const { WebhooksHelper } = require('square');

const isValid = await WebhooksHelper.verifySignature({
  requestBody: rawBody,                                       // raw HTTP body string
  signatureHeader: req.headers['x-square-hmacsha256-signature'],
  signatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY,
  notificationUrl: process.env.SQUARE_WEBHOOK_URL,            // must match the subscription exactly
});

if (!isValid) {
  // reject with 400
}
```

`verifySignature` throws if `signatureKey` or `notificationUrl` is missing/empty
and returns `false` (rather than throwing) for a `null` body or a bad signature,
so wrap the call in `try/catch` and treat both a thrown error and a `false`
result as an invalid request.

### Manual Verification (fallback — e.g. Python / FastAPI)

Square also ships a Python helper (`is_valid_webhook_event_signature`), but the
algorithm is simple enough to implement directly and avoid an extra dependency.
Compute the HMAC yourself and compare in constant time:

```python
import hmac
import hashlib
import base64


def is_valid_square_signature(raw_body: bytes, signature: str, key: str, url: str) -> bool:
    # Signed content is the notification URL + the raw request body
    payload = url.encode("utf-8") + raw_body
    digest = hmac.new(key.encode("utf-8"), payload, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("utf-8")
    # Constant-time comparison prevents timing attacks
    return hmac.compare_digest(expected, signature)
```

The equivalent manual implementation in Node:

```javascript
const crypto = require('crypto');

function isValidSquareSignature(rawBody, signature, key, url) {
  const hash = crypto
    .createHmac('sha256', key)
    .update(url + rawBody)      // notification URL + raw body
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;               // length mismatch → invalid
  }
}
```

## Common Gotchas

- **Use the raw body.** Verify the exact bytes Square sent. If you parse JSON
  and re-serialize, whitespace and key ordering change and the signature will
  not match. In Express use `express.raw()`; in Next.js use `await request.text()`;
  in FastAPI use `await request.body()`.
- **The notification URL is part of the signature.** It must match the
  subscription's registered URL exactly — including `https://`, host, and path.
  A trailing slash or `http` vs `https` mismatch breaks verification.
- **Each subscription has its own signature key.** Sandbox and Production keys
  differ. Verify with the key that matches the environment sending the event.
- **Use a timing-safe comparison.** Compare with `crypto.timingSafeEqual`
  (Node) or `hmac.compare_digest` (Python), not `==`.
- **Header casing.** HTTP headers are case-insensitive; frameworks typically
  lowercase them, so read `x-square-hmacsha256-signature`.

## Debugging Verification Failures

- **Signature never matches:** Confirm `SQUARE_WEBHOOK_URL` is byte-for-byte the
  notification URL on the subscription. This is the most common cause.
- **Works in Sandbox, fails in Production (or vice versa):** You are using the
  wrong signature key for the environment.
- **Intermittent failures:** Ensure you verify the raw body before any
  middleware parses/normalizes it.
- **`signatureKey is null or empty` error:** `SQUARE_WEBHOOK_SIGNATURE_KEY` is
  not set in the environment.
