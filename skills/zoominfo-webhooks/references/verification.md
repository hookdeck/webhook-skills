# How to Verify ZoomInfo Webhooks

## How Does ZoomInfo Authenticate Webhooks?

ZoomInfo does **not** sign payloads (no HMAC, no signed timestamp). When you create a webhook, ZoomInfo generates a verification token. Every `POST` to your target URL carries it in the `x-zoominfo-token` header. Your app authorizes a delivery by comparing that header with the stored token.

| Item | Value |
|------|-------|
| Header | `x-zoominfo-token` |
| Algorithm | None (shared token, plain comparison) |
| Signed content | None |
| Standard Webhooks | No |
| Rotation | "Generate New Token" in the Admin Portal, any time |

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyZoomInfoToken(tokenHeader, expectedToken) {
  if (!tokenHeader || !expectedToken) return false;
  const received = Buffer.from(tokenHeader);
  const expected = Buffer.from(expectedToken);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

### Python

```python
import hmac

def verify_zoominfo_token(token_header, expected_token) -> bool:
    if not token_header or not expected_token:
        return False
    return hmac.compare_digest(token_header.encode("utf-8"), expected_token.encode("utf-8"))
```

Respond `401` for a missing or wrong token, `400` for a valid token with invalid JSON, `200` on success.

## Common Gotchas

- **Validate runs before the token exists.** Accept it without processing while no token is configured, then require the token once you have stored it.
- **Rotating the token breaks deliveries until you update your secret.** Change `ZOOMINFO_WEBHOOK_TOKEN` as soon as you regenerate.
- **Compare in constant time**, and check lengths first: `crypto.timingSafeEqual` throws on unequal lengths.
- **HTTPS only.** The token is a bearer secret sent on every request.
- **No replay protection.** There is no timestamp to check, so make handlers idempotent (see webhook-handler-patterns).
- **Header names are case-insensitive.** Node lowercases them; read `x-zoominfo-token`.

## Debugging Verification Failures

- `401` on every delivery: the stored token is stale (regenerated in ZoomInfo) or has trailing whitespace/newline from copy-paste.
- `401` only on Validate: the guide does not say Validate sends the token; unset it for that step.
- Nothing arrives: the webhook is not Active, or no subscribed record changed (only records enriched through the API in the past 12 months produce events).
