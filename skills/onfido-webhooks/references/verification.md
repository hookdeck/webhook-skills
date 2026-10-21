# Onfido Signature Verification

## How It Works

Each delivery has an `X-SHA2-Signature` header containing the **hex** HMAC-SHA256 of the **raw request body**. The key is the webhook's `token` (from webhook registration or the Dashboard), used as a raw UTF-8 string. There is no timestamp, no prefix and no message ID to include in the signed content.

```
signature = hex( HMAC_SHA256(key = webhook_token, data = raw_body) )
```

The event is valid if the header equals your computed signature, compared in constant time.

## Implementation

### SDK Verification (Node.js)

The `@onfido/api` package provides `WebhookEventVerifier`:

```javascript
const { WebhookEventVerifier } = require('@onfido/api');

const verifier = new WebhookEventVerifier(process.env.ONFIDO_WEBHOOK_TOKEN);
const event = verifier.readPayload(rawBody, req.get('X-SHA2-Signature')); // throws on mismatch
```

`readPayload` throws `OnfidoInvalidSignatureError` on a mismatch but a plain `RangeError` if the hex signature is a different length from the expected one. Catch all errors and respond 400.

### Manual Verification (Python / no SDK)

```python
import hmac, hashlib

def verify(raw_body: bytes, signature: str, token: str) -> bool:
    expected = hmac.new(token.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest((signature or "").lower(), expected)
```

Manual Node.js equivalent:

```javascript
const expected = crypto.createHmac('sha256', token).update(rawBody).digest();
const given = Buffer.from(signature, 'hex');
const ok = given.length === expected.length && crypto.timingSafeEqual(given, expected);
```

## Common Gotchas

- **Use the raw body.** Onfido warns that parsed JSON may be reordered. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **The key is the webhook token**, not your API token and not an OAuth client secret. Sandbox and live webhooks have different tokens.
- **The token is used as-is**, with no base64 or hex decoding.
- **No replay protection built in.** There's no timestamp to check, so deduplicate on `object.id` + `action`. Delivery is at-least-once.
- **OAuth is separate.** A webhook can optionally fetch an OAuth access token to send as `Authorization: Bearer`. That is not a replacement for signature verification.
- **Respond 20x within 10 seconds**, or Onfido retries and eventually disables the webhook.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Always invalid | Wrong token (sandbox vs live), or the body was parsed and re-serialised before verifying |
| Invalid only for some bodies | A body-parsing middleware ran first and changed whitespace/key order |
| `RangeError` from the SDK | Malformed or truncated signature header; catch and return 400 |
| No header present | Request didn't come from Onfido, or a proxy stripped `X-SHA2-Signature` |
