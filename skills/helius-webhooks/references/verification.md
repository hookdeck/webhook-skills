# How to Authenticate Helius Webhook Requests

## Does Helius Sign Webhooks?

No. Helius webhooks have no HMAC signature, signing secret or timestamp header. According to the Helius FAQ, you set an authorization header when creating or updating the webhook, and Helius echoes that value in the `Authorization` header on every delivery. Authentication is therefore a shared-secret check on that one header.

| Item | Value |
|------|-------|
| Header | `Authorization` |
| Value | Exactly the `authHeader` you registered (for example `Bearer your-secret-token`) |
| Algorithm | None: constant-time equality on the whole value |
| Optional? | Yes. If no `authHeader` is set, no header is sent, so always set one |

The `signature` field inside each payload element is the Solana transaction signature. It identifies the transaction on-chain and is not a webhook signature.

## Implementation

There is no SDK call for this check, so all three examples do it manually: hash both values with SHA-256 and compare the digests with a constant-time function, so unequal lengths never throw.

```javascript
const crypto = require('crypto');

function verifyHeliusAuth(received, expected) {
  if (!received || !expected) return false;
  const a = crypto.createHash('sha256').update(received).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
```

```python
import hashlib, hmac
from typing import Optional

def verify_helius_auth(received: Optional[str], expected: Optional[str]) -> bool:
    if not received or not expected:
        return False
    return hmac.compare_digest(
        hashlib.sha256(received.encode()).digest(),
        hashlib.sha256(expected.encode()).digest(),
    )
```

## Common Gotchas

- **Compare the whole value.** If the `authHeader` is `Bearer abc`, the incoming header is `Bearer abc`. Don't strip the scheme or parse it as Basic auth.
- **Don't treat payload `signature` as a signature.** It's the transaction signature.
- **No replay protection from the header.** The same secret is sent on every request, so de-duplicate on the transaction `signature` and keep the secret private. Use HTTPS only.
- **The body is an array.** Iterate it; one request can carry several transactions.
- **Fail closed.** If `HELIUS_AUTH_HEADER` is not configured, reject (the examples return 500) rather than accept everything.

## Status Codes and Retries

- Return `200` within **1 second**; do slow work asynchronously.
- Helius retries on `5xx`, on `4xx` except `403`, on timeouts and on connection errors: up to **3 retries**, 1 second apart. After that the event is lost.
- A failed auth check returns `401` in the examples. Helius will retry it; that is harmless but counts toward the failure rate that can auto-disable the webhook.

## Debugging Authentication Failures

- Log (privately, never in production) whether an `Authorization` header arrived at all. If none arrives, the webhook was created without an `authHeader`; edit it in the dashboard.
- Check for stray whitespace or quotes in your environment variable.
- Make sure a proxy or CDN in front of your app isn't stripping or rewriting `Authorization`.
- Use [webhook.site](https://webhook.site/) to see the exact header Helius sends.
