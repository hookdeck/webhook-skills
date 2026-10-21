# How to Verify Attio Webhook Signatures

## How It Works

Attio signs every webhook request with the webhook's secret:

```
Attio-Signature = hex( HMAC-SHA256( key = webhook_secret, message = raw_request_body ) )
```

- **Header:** `Attio-Signature`. The same value is also sent as `X-Attio-Signature` for legacy middleware.
- **Algorithm:** HMAC-SHA256.
- **Signed content:** the raw request body only (read as UTF-8). No timestamp, no message ID, no prefix.
- **Encoding:** lowercase hexadecimal (64 characters), no `sha256=` prefix.
- **Secret:** the webhook's secret, used as-is (UTF-8 string, not base64-decoded). It's shown in developer settings and returned once in the create-webhook API response.

Attio does **not** use Standard Webhooks (`webhook-id` / `webhook-timestamp` / `webhook-signature`) and offers no official SDK helper for verification, so verify manually.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyAttioSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  // Reject anything that isn't a 64-char hex digest before comparing
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature.toLowerCase(), 'hex'),
    Buffer.from(expected, 'hex')
  );
}

// Express: read the raw body, then verify
app.post('/webhooks/attio', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.get('attio-signature') ?? req.get('x-attio-signature');
  if (!verifyAttioSignature(req.body, signature, process.env.ATTIO_WEBHOOK_SECRET)) {
    return res.status(400).send('Invalid signature');
  }
  const payload = JSON.parse(req.body.toString('utf8'));
  // ...
});
```

### Python

```python
import hashlib
import hmac


def verify_attio_signature(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes: compare_digest raises TypeError on non-ASCII str input
    return hmac.compare_digest(signature.lower().encode(), expected.encode())
```

## Common Gotchas

- **Raw body required.** Verify the exact bytes Attio sent. In Express use `express.raw()` (not `express.json()`) on the route; in Next.js use `await request.text()`; in FastAPI use `await request.body()`. Re-serializing parsed JSON changes whitespace and key order and breaks the HMAC.
- **No prefix.** Unlike GitHub (`sha256=...`), the header value is the bare hex digest.
- **Hex, not base64.** Unlike Shopify, the digest is hex-encoded.
- **Header case.** Node and Starlette lowercase header names (`attio-signature`). Look up either `Attio-Signature` or `X-Attio-Signature`; they carry the same value.
- **One secret per webhook.** Each webhook has its own secret. If you have several webhooks (or an integration installed in many workspaces), pick the secret by `webhook_id`. Since you need to parse the body to read `webhook_id`, treat that value as untrusted until the signature checks out.
- **No replay protection in the signature.** The signed content has no timestamp. Deduplicate on the `Idempotency-Key` header, which is stable across retries, so a replayed message isn't processed twice.
- **Old webhooks keep their secret.** If you delete and recreate a webhook, update `ATTIO_WEBHOOK_SECRET`. The API only returns the secret on creation.
- **Timing-safe comparison.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`, never `===` / `==`. `timingSafeEqual` throws on length mismatch, so validate the header's format first.

## Debugging Verification Failures

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Every request fails | Wrong secret, or one from a different webhook | Copy the secret for this webhook from developer settings |
| Fails only in your framework, not in a script | Body was parsed and re-serialized | Use the raw body (see above) |
| Header missing | Proxy strips custom headers | Check `X-Attio-Signature` too; inspect requests in the Hookdeck CLI web UI |
| Works for test events, fails for real ones | Several webhooks hit the same URL with different secrets | Choose the secret by `webhook_id` |

To check by hand, compute the expected signature for a captured body:

```bash
printf '%s' "$RAW_BODY" | openssl dgst -sha256 -hmac "$ATTIO_WEBHOOK_SECRET" -hex
```

## Idempotency

Attio delivers at least once. Each message carries an `Idempotency-Key` header that differs between messages and stays the same across retries and redeliveries. After verifying the signature, check whether you've already processed the key; if so, return `200` without reprocessing. The examples use an in-memory set; production code should use a durable store (database unique constraint, Redis `SET NX` with a TTL longer than Attio's ~3 day retry window).
