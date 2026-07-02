# How to Verify Zoom Webhook Signatures

## Why Signature Verification Matters

Your Zoom webhook endpoint is a public URL. Anyone can `POST` to it. Signature
verification proves each request was actually sent by Zoom and was not modified
in transit. Never act on a Zoom webhook before verifying its signature.

## How It Works

Zoom signs every webhook with **HMAC-SHA256** keyed on your app's **Secret
Token** and sends two headers:

| Header | Description |
|--------|-------------|
| `x-zm-signature` | The signature, formatted as `v0=<hex digest>` |
| `x-zm-request-timestamp` | Unix timestamp used in the signed message |

The signed message is constructed as:

```
v0:{x-zm-request-timestamp}:{raw request body}
```

To verify:

1. Read the raw request body (the exact bytes — do **not** re-serialize parsed JSON).
2. Build `message = "v0:" + timestamp + ":" + rawBody`.
3. Compute `HMAC-SHA256(message, secretToken)` and hex-encode it.
4. Prefix with `v0=` and compare timing-safe against `x-zm-signature`.

## The endpoint.url_validation Handshake

Zoom does not ship a webhook-verification SDK, so verification is implemented
manually in every framework below. Separately from signature verification, Zoom
requires a one-time challenge-response when you register or re-save the endpoint.

When `event === "endpoint.url_validation"`, the payload contains a `plainToken`:

```json
{
  "event": "endpoint.url_validation",
  "payload": { "plainToken": "qgg8vlvZRS6UYooatFL8Aw" },
  "event_ts": 1654503849680
}
```

Respond `200` within 3 seconds with:

```json
{
  "plainToken": "qgg8vlvZRS6UYooatFL8Aw",
  "encryptedToken": "<HMAC-SHA256(plainToken, secretToken) as hex>"
}
```

Note the `encryptedToken` is HMAC of the **plainToken** (not the `v0:...`
message) keyed on the Secret Token. This is a different computation from the
`x-zm-signature` verification above.

## Implementation

Zoom has no official webhook-verification SDK, so use manual HMAC in all
frameworks.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyZoomWebhook(rawBody, timestamp, signature, secretToken) {
  if (!timestamp || !signature) return false;
  const message = `v0:${timestamp}:${rawBody}`;
  const expected = 'v0=' + crypto.createHmac('sha256', secretToken).update(message).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function validationResponse(plainToken, secretToken) {
  const encryptedToken = crypto.createHmac('sha256', secretToken).update(plainToken).digest('hex');
  return { plainToken, encryptedToken };
}
```

### Python (FastAPI)

```python
import hmac, hashlib

def verify_zoom_webhook(raw_body: bytes, timestamp: str, signature: str, secret_token: str) -> bool:
    if not timestamp or not signature:
        return False
    message = b"v0:" + timestamp.encode() + b":" + raw_body
    expected = "v0=" + hmac.new(secret_token.encode(), message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)

def validation_response(plain_token: str, secret_token: str) -> dict:
    encrypted = hmac.new(secret_token.encode(), plain_token.encode(), hashlib.sha256).hexdigest()
    return {"plainToken": plain_token, "encryptedToken": encrypted}
```

## Common Gotchas

- **Use the raw body.** Signature is computed over the exact request bytes. If
  your framework parses JSON before you verify (e.g. `express.json()`), the
  re-serialized string will differ and verification fails. Use `express.raw()`,
  `request.text()` (Next.js), or `await request.body()` (FastAPI).
- **Include the `v0=` prefix.** The `x-zm-signature` header is `v0=<hex>`. Build
  your expected value with the same prefix before comparing.
- **The timestamp is part of the message.** Missing or wrong
  `x-zm-request-timestamp` produces a different hash.
- **Hex, not base64.** Zoom uses hex encoding for both the signature and the
  `encryptedToken`.
- **url_validation uses a different HMAC.** `encryptedToken` hashes the
  `plainToken` alone, not the `v0:{timestamp}:{body}` message.
- **Respond within 3 seconds.** Verify and acknowledge quickly; do heavy work
  asynchronously after returning `200`.

## Debugging Verification Failures

- Log the reconstructed `message` and confirm it is exactly
  `v0:{timestamp}:{rawBody}` with no extra whitespace or re-encoding.
- Confirm `ZOOM_WEBHOOK_SECRET_TOKEN` matches the **Secret Token** on the app's
  Feature page (not the Client Secret or Verification Token).
- Ensure your body parser is not consuming the body before verification.
- For the handshake, confirm you are hashing `plainToken` (not the whole body)
  and returning both `plainToken` and `encryptedToken`.
