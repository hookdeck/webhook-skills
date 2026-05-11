# Scrapfly Signature Verification

## How It Works

Scrapfly signs every webhook with **HMAC-SHA256** over the **raw request body bytes**. The digest is emitted as **uppercase hexadecimal** in the `X-Scrapfly-Webhook-Signature` header. A duplicate lowercase variant is sent as `X-Scrapfly-Webhook-Signature-Lowercase` for runtimes that normalise headers.

There is **no timestamp** in the scheme and **no replay window** — treat the signature as authenticity-only. (If you need replay protection, gate processing on the `X-Scrapfly-Webhook-Id` header or the job UUID.)

## Algorithm

```
signature = upper(hex(HMAC_SHA256(secret_utf8, raw_body_bytes)))
```

Compare with `received == signature` using a constant-time comparison.

## Implementation

Scrapfly does not publish an SDK for webhook verification — implementations follow the documented algorithm manually.

### Node.js / Express / Next.js

```javascript
const crypto = require('crypto');

function verifyScrapflySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')
    .toUpperCase();

  const received = signatureHeader.toUpperCase();

  try {
    return crypto.timingSafeEqual(
      Buffer.from(received, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}
```

Notes:
- `rawBody` must be a `Buffer` (Express) or the raw `string` from `await request.text()` (Next.js). **Never** `JSON.parse` and re-stringify — that mutates whitespace/key order and breaks the signature.
- `crypto.timingSafeEqual` requires equal-length buffers; the `try/catch` swallows length mismatches so the function returns `false` rather than throwing.

### Python / FastAPI

```python
import hmac
import hashlib

def verify_scrapfly_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False

    expected = hmac.new(
        secret.encode('utf-8'),
        raw_body,
        hashlib.sha256,
    ).hexdigest().upper()

    return hmac.compare_digest(expected, signature_header.upper())
```

Notes:
- Use `await request.body()` in FastAPI to get `bytes`. Do not call `await request.json()` before verifying.
- `hmac.compare_digest` is the documented constant-time comparator.

## Security: Do Not Log the Raw Payload

Scrapfly echoes the webhook signing secret in the body at `context.webhook.secret`. This is unusual compared to other providers and easy to miss.

- **Never** log the raw payload, dump it to stdout in production, or forward it to third-party tools (Sentry, Datadog, Slack, etc.) without redacting `context.webhook.secret` first.
- If you persist webhooks for replay/debugging, strip or redact `context.webhook.secret` before storage.
- Anyone with the secret can forge valid signatures for your endpoint.

```javascript
// Redact before logging / forwarding
const safe = { ...payload, context: { ...payload.context, webhook: { ...payload.context?.webhook, secret: '[REDACTED]' } } };
```

## Common Gotchas

- **Parsed JSON breaks signatures.** Verify against the exact bytes Scrapfly sent. In Express, mount `express.raw({ type: '*/*' })` on the webhook route (not `express.json`). In Next.js App Router, read with `await request.text()`. In FastAPI, use `await request.body()`.
- **Case of the hex digest.** Scrapfly's primary header is uppercase, but the `-Lowercase` variant exists for a reason. Always normalise both sides before comparing (the snippets above use `.toUpperCase()` / `.upper()`).
- **Header casing in HTTP frameworks.** HTTP header names are case-insensitive. Express lowercases everything; Next.js's `headers.get(...)` is also case-insensitive. Read `x-scrapfly-webhook-signature`.
- **No timestamp tolerance.** Don't reject for old timestamps — there isn't one. If you need replay protection, dedupe on `X-Scrapfly-Webhook-Id`.
- **Secret format.** Use the dashboard string verbatim. There is no `whsec_` prefix to strip and no base64 decode step.
- **Body encoding.** The HMAC is over bytes, not text. Avoid any middleware that transforms encoding (gzip middleware, BOM strippers, etc.) on the route.

## Debugging Verification Failures

1. **Log both signatures side-by-side** (the computed expected and the received header) — they should be identical, byte for byte, after normalising case.
2. **Log the body length** received vs. the `Content-Length` header. A mismatch means a middleware ate the body.
3. **Hash a known string with your secret** locally and compare with Scrapfly's documented Python sample:
   ```python
   hmac.new(b'YOUR-SECRET', b'{"data": "example"}', hashlib.sha256).hexdigest().upper()
   ```
4. **Check the right header.** `X-Scrapfly-Webhook-Signature` (uppercase hex) — not `Signature`, not `X-Signature`, not `webhook-signature`.
5. **Confirm you're using the right secret.** Webhooks are scoped per project + environment; the dashboard shows the secret for the specific webhook.
