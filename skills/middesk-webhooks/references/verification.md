# How to Verify Middesk Webhook Signatures

## How It Works

- Header: `X-Middesk-Signature-256`
- Algorithm: HMAC-SHA256
- Signed content: the raw request body, exactly as received (no timestamp or ID is prepended)
- Encoding: bare lowercase hex digest, with no `sha256=` prefix
- Key: the `secret` set when the webhook was created, used whole as a UTF-8 string

This is **not** Standard Webhooks. There are no `webhook-id`/`webhook-timestamp`/`webhook-signature` headers, so do not use `standardwebhooks` or `svix`, and do not strip or base64-decode a `whsec_` prefix.

## Implementation

Middesk has no webhook verification SDK; verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyMiddeskWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
```

### Python

```python
import hashlib, hmac

def verify_middesk_webhook(raw_body: bytes, signature_header, secret) -> bool:
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(
        signature_header.strip().lower().encode("utf-8"), expected.encode("utf-8")
    )
```

## Common Gotchas

- **Raw body**: verify before parsing. Re-serialized JSON changes bytes and breaks the signature. In Express use `express.raw({ type: '*/*' })`, in Next.js `await request.text()`, in FastAPI `await request.body()`.
- **Don't use `bodyParser.json({ verify })` and compare with `!==`**: the docs' JavaScript sample does this, but a timing-safe comparison is better.
- **Secret handling**: the secret is used whole. `whsec_abcdef123456` is the key, not `abcdef123456`, and not its base64 decoding.
- **No timestamp**: there is nothing to check for replay, so dedupe on the event `id`.
- **Sandbox vs Production**: each webhook has its own secret.
- **Status codes**: the docs' samples return 400 (Ruby, Python) or 401 (JavaScript) on a bad signature; the examples here use 400. Middesk retries on any non-2xx.

## Debugging Verification Failures

1. Log the raw body length and confirm it matches what was sent (a body parser may have touched it).
2. Confirm the secret in your environment is byte-for-byte the one set on the webhook (trailing newline in `.env` is a common culprit).
3. Confirm you're reading `X-Middesk-Signature-256` (not an `X-Hub-Signature` style header) and not expecting a `sha256=` prefix.
4. Check you're using the sandbox secret for sandbox events and the Production secret for Production events.
