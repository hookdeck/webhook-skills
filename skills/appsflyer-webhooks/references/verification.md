# How to Verify AppsFlyer Webhooks

## How Does AppsFlyer Authenticate Webhooks?

It doesn't sign them. There is no signature header, no HMAC and no timestamp.
You configure a custom authorization header (name plus token) per app ID, and
AppsFlyer sends that header on every Push API request.

## Implementation

No SDK helper exists, so compare the header yourself in constant time.

### Node.js

```javascript
const crypto = require('crypto');

function verifyAppsflyerToken(received, expected) {
  if (!received || !expected) return false;
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hmac

def verify_appsflyer_token(received, expected):
    if not received or not expected:
        return False
    return hmac.compare_digest(received.encode("utf-8"), expected.encode("utf-8"))
```

## Common Gotchas

- **Compare the whole value.** If you configured `Bearer abc`, the expected
  value is `Bearer abc`, not `abc`.
- **Header name is yours.** Read the header you configured; HTTP header names
  are case-insensitive.
- **Use POST.** GET puts the record in the query string.
- **Fail closed.** If the token env var is missing, return 500, never accept.
- **No replay protection.** There is no timestamp to check, so deduplicate on
  `appsflyer_id` + `event_name` + `event_time`.
- **Tokens are per app ID.** Look up the expected token by `app_id` if they differ.

## Debugging Verification Failures

| Symptom | Likely cause |
|---|---|
| 401 on every request | Token or header name differs from the Push API config; stray whitespace |
| 401 only for some apps | Different token configured for that app ID |
| 500 | `APPSFLYER_AUTH_TOKEN` not set on the server |
| 400 | Body isn't JSON (check POST is selected, not GET) |

Inspect the real headers with `npx hookdeck-cli listen 3000 appsflyer --path /webhooks/appsflyer`.
