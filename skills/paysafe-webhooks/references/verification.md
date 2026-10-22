# Paysafe Webhook Signature Verification

## How It Works

Paysafe documents:

```
digest = HMAC_SHA256(hmacKey, UTF-8 string containing the JSON webhook request body)
signature = base64(digest)
```

The result is sent in the `Signature` header, for example `Signature: UMaQ4h635wUc4hp60Z5ASBC/5UtqKybAldOkLv6ngc0=`. Recompute it and compare. There is no timestamp or message id in the signed content, so use `resourceId` plus `eventName` (and `attemptNumber`) for idempotency.

## Implementation

Paysafe's official Payments API SDKs (Java, PHP) use the HMAC key as a raw UTF-8 string. No Node or Python SDK covers this, so all three examples use manual verification. (The legacy Alternate Payments v1 SDK base64-decoded the key; that is not covered here.)

### Node.js

```javascript
const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected)); // wrap in try/catch
```

### Python

```python
expected = base64.b64encode(hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()).decode()
hmac.compare_digest(signature_header.encode(), expected.encode())
```

## Common Gotchas

- **Raw body**: Hash the exact bytes received. Re-serializing parsed JSON (even pretty-printed bodies) changes the bytes and breaks the signature.
- **Any content type**: In Express use `express.raw({ type: '*/*' })`, since `application/json`-only parsers skip other content types.
- **Key encoding**: Use the key as a plain string; do not base64-decode it.
- **Header name**: `Signature` (HTTP headers are case-insensitive; frameworks usually lowercase it).
- **Status codes**: 4xx/5xx triggers Paysafe retries (up to three), so return 400 for bad signatures only when you intend to reject, and 2xx once accepted.

## Debugging Verification Failures

1. Log the raw body length and compare with what Paysafe sent (Hookdeck request inspector helps).
2. Confirm you use the HMAC key for the right environment (test vs live).
3. Make sure no middleware parsed or modified the body first.
4. Recompute with a known vector: key `test-secret-key` and your own body, using `openssl dgst -sha256 -hmac 'test-secret-key' -binary < body.json | base64`.
