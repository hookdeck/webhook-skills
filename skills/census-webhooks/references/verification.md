# How to Verify Census Webhook Signatures

## How It Works

Each request carries an `X-Signature` header: the **standard base64** encoding of the HMAC-SHA256 digest of the **raw request body**, keyed with the one-time secret from webhook creation. The secret is used as plain bytes (the official Python example uses `b'<secret>'`), with no base64 decoding or `whsec_` prefix handling. There is no timestamp, no signed ID, and no prefix on the header value.

Because only the body is signed, nothing in the signature protects against replays. Dedupe on `sync_run_id` plus `event` (and `alert_instance_id` for alert events) if duplicate processing matters.

## Implementation

Activations documents no verification SDK, so use manual verification.

### Node.js (Express)

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader.trim()), Buffer.from(expected));
  } catch {
    return false;
  }
}

app.post('/webhooks/census', express.raw({ type: '*/*' }), (req, res) => {
  if (!verify(req.body, req.headers['x-signature'], process.env.CENSUS_WEBHOOK_SECRET)) {
    return res.status(400).send('Invalid signature');
  }
  // ...parse JSON from req.body after verifying
  res.status(200).send('OK');
});
```

### Python (FastAPI)

```python
import base64, hmac, hashlib

def verify(raw_body: bytes, signature_header, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = base64.b64encode(
        hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(signature_header.strip(), expected)
```

## Common Gotchas

- **Base64, not hex.** Don't reuse a Fivetran REST API webhook verifier (`X-Fivetran-Signature-256`, hex, uppercase); it will always fail here.
- **Raw body only.** Verify the exact bytes received. Re-serialising parsed JSON changes whitespace and key order. The sample payloads in the docs even contain irregular spacing.
- **Any content type.** Use `express.raw({ type: '*/*' })` rather than `type: 'application/json'`, so verification doesn't depend on the `Content-Type` sent.
- **Header name.** It's the generic `X-Signature`; read it case-insensitively (`x-signature` in Node and FastAPI).
- **Secret copied once.** If verification fails for every request, the stored secret probably isn't the one shown at creation. Create a new webhook.
- **No SDK.** Compare strings of equal length with a timing-safe function, and guard against length mismatches.

## Debugging Verification Failures

1. Confirm the header exists and is base64 (ends in `=` for a 32-byte digest, 44 characters).
2. Log the length of the raw body and compare with `Content-Length`; a mismatch means a middleware changed it.
3. Recompute with a known payload: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64`.
4. Check no proxy or framework is parsing the body before your handler.
