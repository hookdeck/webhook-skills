# BitGo Signature Verification

## What BitGo Documents

- The [webhooks overview](https://developers.bitgo.com/docs/webhooks-overview): notifications use your secret "in conjunction with an HMAC hashing algorithm (`x-signature-sha256`)", and "You can call the Verify Webhook Notification endpoint to verify webhook notifications that you receive."
- The [verify endpoint](https://developers.bitgo.com/reference/v2webhooknotificationverify) (`POST /api/v2/webhook/{webhookId}/verify`) takes `signature`, the `X-Signature-SHA256` header value (`^[0-9a-f]{64}$`), and `notificationPayload`, the payload "as JSON string". It returns `{ "webhookId": "...", "isValid": true }`.

BitGo doesn't publish the local algorithm, and BitGoJS has no verification code.

## The Local Check (Inferred)

| Part | Value |
|---|---|
| Header | `X-Signature-SHA256` |
| Algorithm | HMAC-SHA256, lowercase hex (64 characters), no prefix |
| Key | The webhook secret, as UTF-8 text |
| Signed content | The raw request body |

This follows from the header name, the documented value format and independent receivers that verify BitGo deliveries the same way. Confirm it once:

1. Receive a delivery (a simulated one is fine) and keep its raw body and header.
2. Send both to the verify endpoint:

```bash
curl -X POST "https://app.bitgo-test.com/api/v2/webhook/$WEBHOOK_ID/verify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{ "signature": "<X-Signature-SHA256 value>", "notificationPayload": "<raw body as a string>" }'
```

3. Check that `isValid` is `true` and that the example's check agrees.

(BitGo's wallet guide puts the webhook secret in the `signature` field of this example. The API reference says `signature` is the header value.)

If you'd rather not depend on the inferred scheme, call the verify endpoint for each delivery instead of checking locally. That costs an API call per notification.

## Node.js

```javascript
const crypto = require('crypto');

function verifyBitGoSignature(rawBody, signature, secret) {
  const value = String(signature || '').trim();
  if (!secret || !/^[0-9a-fA-F]{64}$/.test(value)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'hex'), expected);
}
```

## Python

```python
import hashlib, hmac, re

def verify_bitgo_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    value = (signature or "").strip()
    if not secret or not re.fullmatch(r"[0-9a-fA-F]{64}", value):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(value), expected)
```

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| No `X-Signature-SHA256` header | No webhook secret exists yet. Call `POST /api/v2/webhook/secret` |
| Every request fails | The body was parsed and re-serialised. HMAC the raw bytes |
| Fails after a rotation | The secret was rotated. Update `BITGO_WEBHOOK_SECRET` |
| Local check fails but the verify endpoint says `isValid: true` | The inferred scheme doesn't match. Use the verify endpoint and report it |
| The URL stopped receiving anything | 10 non-retryable 4xx responses in an hour blocked it |
