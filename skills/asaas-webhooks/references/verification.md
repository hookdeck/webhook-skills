# How to Verify Asaas Webhooks

## How It Works

Asaas does **not** sign webhook payloads: there is no HMAC, signature header, or timestamp. The
only authentication is the `authToken` configured on the webhook, sent verbatim as the
**`asaas-access-token`** request header. Your endpoint must compare it to the token you stored.

If no `authToken` was set on the webhook, the header is not sent. Always set one.

## Implementation

There is no Asaas SDK step for this, so verification is a manual constant-time comparison. Hash
both values first so `timingSafeEqual` never sees different lengths.

### Node.js

```javascript
const crypto = require('crypto');

function verifyAsaasToken(receivedToken, expectedToken) {
  if (!receivedToken || !expectedToken) return false;
  const a = crypto.createHash('sha256').update(receivedToken).digest();
  const b = crypto.createHash('sha256').update(expectedToken).digest();
  return crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hashlib, hmac

def verify_asaas_token(received, expected):
    if not received or not expected:
        return False
    return hmac.compare_digest(
        hashlib.sha256(received.encode()).digest(),
        hashlib.sha256(expected.encode()).digest(),
    )
```

## Common Gotchas

- **Not a signature.** Anyone who learns the token can forge events, so keep it secret, serve over
  HTTPS, and rotate it if it leaks (update both Asaas and your env var).
- **Not your API key.** Asaas forbids using an API key as the authToken.
- **Header name** is `asaas-access-token` (lowercase in Node and ASGI; HTTP headers are
  case-insensitive).
- **Token rules:** 32-255 characters, no whitespace. A token with spaces is rejected by Asaas.
- **No replay protection.** There is no timestamp, so dedupe on the top-level event `id`.
- **Raw body.** Read the body as raw bytes and parse JSON only after the token check. Parsing
  first wastes work on unauthenticated requests.
- **Respond fast.** Return `200` after persisting; 15 consecutive failures can pause the queue.
- **Status codes.** The examples return `401` for a missing or wrong token, `400` for invalid
  JSON, and `500` if `ASAAS_WEBHOOK_TOKEN` is unset. Asaas treats any non-200 as a failure.

## Debugging Verification Failures

- Compare the header in **Webhook Logs** (Asaas) with your env var; look for trailing newlines
  or quotes copied into `.env`.
- Confirm Sandbox and Production use different webhooks, and so possibly different tokens.
- A `403` in the logs usually means a firewall/WAF is blocking Asaas, not a token problem. Allow
  the [official IPs](https://docs.asaas.com/docs/official-asaas-ips).
- Behind a proxy, make sure `asaas-access-token` is forwarded.
