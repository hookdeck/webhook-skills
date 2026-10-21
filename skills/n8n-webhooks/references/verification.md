# How to Authenticate n8n HTTP Request Webhooks

## How It Works

n8n's HTTP Request node **does not sign requests**: there is no HMAC, timestamp or signature
header. Authenticity comes from a shared secret that the node sends via one of its generic
credentials:

| n8n credential | What arrives | Env vars in the examples |
|----------------|--------------|--------------------------|
| Header Auth | `X-Webhook-Secret: <secret>` (header name is yours to choose) | `N8N_WEBHOOK_SECRET`, `N8N_WEBHOOK_HEADER` |
| Bearer Auth | `Authorization: Bearer <secret>` | `N8N_WEBHOOK_SECRET` |
| Basic Auth | `Authorization: Basic base64(user:password)` | `N8N_BASIC_AUTH_USER`, `N8N_BASIC_AUTH_PASSWORD` |

n8n's docs describe Bearer auth as "just header authentication with the Name set to
Authorization and the Value set to Bearer <token>". The examples accept any of the three, so
you can switch credential types in n8n without code changes.

## Implementation

There's no SDK; verification is a constant-time string comparison.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

// Hash both sides so the buffers are equal length: timingSafeEqual can't throw
// and the secret's length isn't revealed.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyN8nRequest(headers, secret, headerName = 'x-webhook-secret') {
  if (!secret) return false;
  const custom = headers[headerName];
  if (custom && safeEqual(custom, secret)) return true;
  const bearer = (headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return Boolean(bearer && safeEqual(bearer[1].trim(), secret));
}
```

Basic auth: decode the base64 after `Basic `, split on the **first** `:`, and compare the
username and password with `safeEqual` (evaluate both before combining the results).

### Python (FastAPI)

```python
import hashlib, hmac, re

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest()
    )

def verify_n8n_request(headers, secret, header_name="X-Webhook-Secret") -> bool:
    if not secret:
        return False
    value = headers.get(header_name)
    if value and safe_equal(value, secret):
        return True
    bearer = re.match(r"^Bearer\s+(.+)$", headers.get("authorization", ""), re.I)
    return bool(bearer and safe_equal(bearer.group(1).strip(), secret))
```

In FastAPI, wrap this in a dependency (`Depends(require_n8n_auth)`) so the route never runs
for unauthenticated requests.

## Common Gotchas

- **Don't use `===` / `==`.** Plain string comparison returns early on the first differing
  character. Use `crypto.timingSafeEqual` / `hmac.compare_digest`.
- **`timingSafeEqual` throws on unequal lengths.** Hash both values first (as above) or guard
  the lengths.
- **`hmac.compare_digest` raises `TypeError` on non-ASCII `str`.** Compare bytes (the digests
  above).
- **Header case.** n8n lowercases header names by default (**Options → Lowercase Headers**).
  HTTP headers are case-insensitive; Express, Next.js `Headers` and Starlette all look them up
  case-insensitively, but a hand-rolled dict lookup might not.
- **Empty secret.** If `N8N_WEBHOOK_SECRET` is unset, reject everything. Never compare against
  an empty string.
- **Raw body isn't needed for auth** (nothing is signed), but authenticate *before* parsing so
  unauthenticated callers can't make you parse arbitrary input.
- **HTTPS only.** The secret travels in a header on every request; plain HTTP exposes it.
- **No replay protection.** A captured request can be resent. Include a unique `id` in the
  body (e.g. `{{ $execution.id }}-{{ $itemIndex }}`) and dedupe on it if that matters.

## Debugging Authentication Failures

| Symptom in n8n | Likely cause |
|----------------|--------------|
| `401` on every execution | Secret in the credential differs from `N8N_WEBHOOK_SECRET` (watch for trailing whitespace/newlines) |
| `401` with Header auth only | Credential **Name** differs from `N8N_WEBHOOK_HEADER` |
| `401` with Basic auth | `N8N_BASIC_AUTH_USER`/`N8N_BASIC_AUTH_PASSWORD` unset, or the password contains a different character than expected |
| `400 Invalid JSON body` | **Body Content Type** isn't JSON, or the JSON expression produced invalid JSON |
| Connection refused / timeout | n8n Cloud can't reach `localhost`: use a public URL or `npx hookdeck-cli listen` |

Check the HTTP Request node's output (or the execution log) for the exact status and response
body.
