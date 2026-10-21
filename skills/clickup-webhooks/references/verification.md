# How to Verify ClickUp Webhook Signatures

## How Does ClickUp Sign Webhooks?

| Item | Value |
|------|-------|
| Header | `X-Signature` |
| Algorithm | HMAC-SHA256 |
| Key | `webhook.secret` from the Create Webhook API response |
| Signed content | The raw request body, exactly as received |
| Encoding | Hexadecimal (ClickUp: "Signatures are always digested in hexadecimal format") |
| Timestamp / replay window | None |
| Standard Webhooks | No |

To verify: compute `HMAC-SHA256(secret, rawBody)` as hex and compare it with `X-Signature` using a timing-safe comparison.

## Implementation

ClickUp doesn't publish an SDK helper for webhook verification, so verify manually in every framework.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function verifyClickUpWebhook(rawBody, signature, secret) {
  if (!signature || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody) // Buffer or string: the raw body, not re-serialized JSON
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false; // length mismatch
  }
}
```

Express: mount `express.raw({ type: '*/*' })` on the webhook route so `req.body` is a `Buffer`.
Next.js App Router: read `await request.text()` before parsing.

### Python (FastAPI)

```python
import hashlib
import hmac


def verify_clickup_webhook(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.lower(), expected)
```

FastAPI: read `await request.body()` before parsing.

## Common Signature Verification Errors

### Re-serialized JSON

ClickUp's own Node example signs a string and notes that if your framework parses the body, you'd need to stringify it "without adding white spaces". Don't rely on that. Key order, escaping, and number formatting can all change on a round-trip. Always hash the raw bytes.

### Wrong secret

- Each webhook has its own secret. A secret from another webhook won't match.
- The secret is `webhook.secret` from the API response, not your API token and not the webhook `id`.
- Deleting and re-creating a webhook generates a new secret.

### Returning 401 on failure

ClickUp **immediately suspends** a webhook that responds `401` (and `410`). If a misconfigured secret makes your handler return `401`, one bad delivery disables the webhook. Return `400` for missing or invalid signatures, then fix the secret.

### Comparing with `==`

Use `crypto.timingSafeEqual` (Node) or `hmac.compare_digest` (Python). Plain string comparison leaks timing information.

### Signature has a prefix

It doesn't. Unlike GitHub (`sha256=...`), ClickUp sends the bare hex digest.

## How Do I Verify Multiple ClickUp Webhooks on One Endpoint?

Because every webhook has its own secret, a shared endpoint needs to pick the secret per request:

1. Parse `webhook_id` from the raw body (it isn't trusted yet; it only selects a key)
2. Look up that webhook's secret (from your database or config)
3. Verify `X-Signature` against the raw body with that secret
4. Only then act on the payload

An unknown `webhook_id` should fail verification (return `400`).

## How Do I Debug Verification Failures?

1. Log the length of the raw body you hash and compare it with `Content-Length`
2. Confirm the header you read is `x-signature` (header names are case-insensitive; Node and FastAPI lowercase them)
3. Recompute locally:

   ```bash
   printf '%s' "$RAW_BODY" | openssl dgst -sha256 -hmac "$CLICKUP_WEBHOOK_SECRET" -hex
   ```

4. Check the webhook's `health` via `GET /api/v2/team/{team_id}/webhook`. A `suspended` status means deliveries have stopped; reactivate it with `PUT /api/v2/webhook/{webhook_id}`.

## Reference

- [ClickUp Webhook signature](https://developer.clickup.com/docs/webhooksignature)
- [ClickUp Webhook health status](https://developer.clickup.com/docs/webhookhealth)
