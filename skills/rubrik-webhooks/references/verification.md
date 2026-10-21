# How to Verify Rubrik Webhooks

## How It Works

Rubrik Security Cloud does **not sign** webhook payloads. There is no HMAC, no signature header
and no timestamp header. Authenticity comes from a credential Rubrik sends with every request,
chosen with `authInfo.authType` (`AuthenticationTypeV2`):

| Value | Rubrik's description | On the wire |
|-------|---------------------|-------------|
| `CUSTOM_HEADER` | "Webhook is authenticated with a custom header." | `<headerKey>: <headerValue>` from `customHeaders` |
| `BEARER` | "Webhook is authenticated with a bearer token." | `Authorization: Bearer <token>` |
| `BASIC` | "Webhook is authenticated with a username/password pair." | `Authorization: Basic base64(username:password)` |
| `OAUTH2` | "Webhook is authenticated with OAuth 2.0." | Bearer token Rubrik obtains from your `tokenUrl` (client credentials) |
| `URL` | "Webhook is authenticated with a URL token." | Token is part of the URL |

**Recommendation:** use `CUSTOM_HEADER` (or `BEARER`) with a long random secret over HTTPS, and
compare in constant time. `BASIC` works too. Avoid `URL`: tokens in URLs leak into access logs.
`OAUTH2` means validating JWTs from your own IdP, which is outside this skill.

## Why Authentication Matters

Without a check, anyone who learns your URL can post fake "backup succeeded" events and hide a
real failure, or fake anomalies to trigger incident workflows.

## Implementation

### SDK Verification

None. Rubrik's SDKs (PowerShell, Python, Go) call the RSC GraphQL API and have no helper for
authenticating incoming webhooks. Use the standard library.

### Manual Verification

**Node.js**

```javascript
const crypto = require('crypto');

const secureEquals = (a, b) => crypto.timingSafeEqual(
  crypto.createHash('sha256').update(String(a), 'utf8').digest(),
  crypto.createHash('sha256').update(String(b), 'utf8').digest()
);

function authenticate(headers) {
  // CUSTOM_HEADER
  const name = (process.env.RUBRIK_WEBHOOK_HEADER_NAME || 'X-Rubrik-Webhook-Token').toLowerCase();
  const secret = process.env.RUBRIK_WEBHOOK_SECRET;
  if (secret && typeof headers[name] === 'string' && secureEquals(headers[name], secret)) return true;

  // BEARER
  const token = process.env.RUBRIK_WEBHOOK_BEARER_TOKEN;
  const m = /^bearer\s+(.+)$/i.exec(headers.authorization || '');
  if (token && m && secureEquals(m[1].trim(), token)) return true;

  return false; // fail closed
}
```

**Python**

```python
import hashlib, hmac, os

def secure_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest())

def authenticate(headers) -> bool:  # Starlette headers: case-insensitive
    secret = os.environ.get("RUBRIK_WEBHOOK_SECRET")
    name = os.environ.get("RUBRIK_WEBHOOK_HEADER_NAME", "X-Rubrik-Webhook-Token")
    value = headers.get(name)
    return bool(secret) and value is not None and secure_equals(value, secret)
```

**Basic auth:** base64-decode the value after `Basic `, split on the **first** colon only
(passwords may contain colons), and compare username and password in constant time. See the
example handlers.

## Common Gotchas

- **Looking for a signature.** There isn't one. Don't add HMAC code or wait for a signature
  header.
- **Header name casing.** Rubrik sends the header key you configured; Node, Next.js and
  Starlette expose headers case-insensitively (Express lowercases them). Compare names in
  lowercase.
- **`Authorization` as the custom header key.** Rubrik's own API example uses
  `headerKey: "Authorization"`, `headerValue: "Bearer Example123"`. In that case the value you
  compare includes the `Bearer ` prefix.
- **Plain `===` comparison.** Leaks timing. Use `crypto.timingSafeEqual` / `hmac.compare_digest`;
  hashing both sides first avoids length-mismatch exceptions.
- **Fail closed.** If no secret is configured, reject. Don't let a missing env var turn
  authentication off.
- **No replay protection.** There is no timestamp to check. Deduplicate on
  `custom_details.id` instead.
- **Slow handlers.** Rubrik retries only 3 times (1s, 5s, 10s) and auto-disables after 25
  consecutive failures, so a slow or flaky handler loses events. Return `200` quickly and
  process asynchronously.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|-------------|
| Every request returns 401 | Env vars not loaded, or header name differs from the `headerKey` set in Rubrik |
| 401 only with `Authorization` header key | Secret is missing the `Bearer ` prefix that Rubrik sends verbatim |
| Basic auth fails for some passwords | Splitting on every colon instead of the first |
| Webhook status `AUTO_DISABLED` | 25 consecutive non-2xx responses or timeouts; check `lastFailedErrorInfo` via `allWebhooksV2` |

To see exactly what Rubrik sends, point the webhook at
`npx hookdeck-cli listen 3000 rubrik --path /webhooks/rubrik` and inspect the request headers in
the CLI's web UI.
