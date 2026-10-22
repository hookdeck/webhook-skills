# Stream Signature Verification

## How Does Stream Sign Webhooks?

- Header: `X-Signature`
- Algorithm: HMAC-SHA256
- Key: the app **API secret**, the full string as UTF-8 (no decoding, no prefix stripping)
- Signed content: the raw request body only (no timestamp, no id)
- Encoding: lowercase hex, no `sha256=` prefix

Stream also sends `X-Webhook-Id` (dedupe key), `X-Webhook-Attempt` and `X-Api-Key`. `X-Api-Key` identifies the app; it is not a credential and not a substitute for the signature.

## Manual Verification

```javascript
const crypto = require('crypto');

function verifyStreamWebhook(rawBody, signature, apiSecret) {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', apiSecret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

```python
import hmac, hashlib

def verify_stream_webhook(raw_body: bytes, signature: str, api_secret: str) -> bool:
    expected = hmac.new(api_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature or "", expected)
```

## SDK Verification

Stream's SDKs verify and parse in one call and throw `InvalidWebhookError` on any failure (signature mismatch, bad gzip, bad JSON):

```javascript
// rawBody: Buffer/string, NOT parsed JSON
const event = client.verifyAndParseWebhook(rawBody, req.headers['x-signature']);
```

```python
event = client.verify_and_parse_webhook(body, signature, secret)  # stateless form takes the secret
```

Static helpers also exist (`Webhook.verifyAndParseWebhook(rawBody, signature, secret)` in Node). The SDK decompresses gzip for you.

## Common Gotchas

- **Raw body.** Verify the exact bytes received. Re-serialising parsed JSON changes whitespace and key order. In Express use `express.raw({ type: '*/*' })` so any content type is read as a Buffer; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Payload Compression.** With `enable_hook_payload_compression` on, bodies over 256 bytes are gzipped and the HMAC covers the **uncompressed** bytes. Verify after decompressing, never on the gzip bytes. Hookdeck's Stream source cannot verify compressed payloads, so turn it off. Apps created after May 7, 2026 default to on.
- **Secret.** Use the API secret, not the API key and not a token you generated.
- **Header case.** Node lowercases headers (`x-signature`); `request.headers.get` and Starlette are case-insensitive.
- **SQS/SNS.** Stream does not attach the app-level signature to SQS/SNS payloads; this applies to HTTP only.
- **Retries.** Stream retries immediately on network errors, 408, 429 and 5xx responses (up to 5 attempts within 15 seconds); other non-2xx responses are not retried; dedupe on `X-Webhook-Id`.

## Debugging Verification Failures

1. Log the body length and first bytes. If they start `1f 8b`, compression is on.
2. Confirm the secret belongs to the same app as `X-Api-Key`.
3. Confirm nothing (body parser, proxy) rewrote the body before verification.
4. Recompute locally: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$STREAM_API_SECRET"`.
