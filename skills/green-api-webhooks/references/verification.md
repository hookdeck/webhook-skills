# How to Verify GREEN-API Webhooks

## How It Works

GREEN-API **does not sign webhooks**. There is no HMAC, no signature header, no
timestamp header, and no Standard Webhooks envelope (`webhook-id`,
`webhook-timestamp`, `webhook-signature`). The only authentication mechanism is
the optional **`webhookUrlToken`** instance setting:

1. You set `webhookUrlToken` in the console or with `SetSettings`.
2. If it isn't empty, GREEN-API sends an `Authorization` header with every
   webhook.
3. Your handler compares that header against the value you stored.

### Caveat: the header is the full value, scheme included

When `webhookUrlToken` is set, GREEN-API sends it as the **full `Authorization`
header value**: `Bearer <token>` (the default) or `Basic <token>`. The docs
tell you to enter the scheme in the setting itself (`Bearer AuthToken` or
`Basic AuthToken`). With no scheme, the header defaults to `Bearer <token>`.

So compare the **whole header value, including the scheme**, using a
constant-time compare. Don't parse out the part after `Bearer ` and compare
only that: you would accept `Basic <token>` when you configured
`Bearer <token>`, and parsing code paths are where timing leaks and
case-sensitivity bugs creep in.

If `webhookUrlToken` is empty, GREEN-API sends **no** `Authorization` header,
and anyone who knows your URL can post fake notifications. Always set a token.

## Implementation

### SDK Verification

GREEN-API's SDKs (`@green-api/whatsapp-api-client`, `whatsapp-api-client-python`,
...) are API clients and don't include a webhook verification helper. Use the
manual comparison below in every framework.

### Manual Verification (Node.js)

```javascript
const crypto = require('crypto');

// Build the header GREEN-API will send from the configured webhookUrlToken.
function expectedAuthorization(token) {
  return /^(Bearer|Basic) /.test(token) ? token : `Bearer ${token}`;
}

function verifyGreenApiAuthorization(header, token) {
  if (!header || !token) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expectedAuthorization(token));
  // timingSafeEqual throws on unequal lengths, so check length first.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

if (!verifyGreenApiAuthorization(req.headers['authorization'], process.env.GREEN_API_WEBHOOK_URL_TOKEN)) {
  return res.status(401).send('Invalid Authorization header');
}
```

### Manual Verification (Python)

```python
import hmac
import re


def expected_authorization(token: str) -> str:
    return token if re.match(r"^(Bearer|Basic) ", token) else f"Bearer {token}"


def verify_green_api_authorization(header: str | None, token: str | None) -> bool:
    if not header or not token:
        return False
    # compare_digest is constant-time and handles unequal lengths
    return hmac.compare_digest(header.encode(), expected_authorization(token).encode())
```

## Raw Body

Nothing is computed over the body, so parsing JSON before the check doesn't
break verification. Still check the header **before** acting on the payload.

## Can I Restrict by IP Address?

Yes. GREEN-API publishes the IPs it sends webhooks from:

```
46.101.109.139   51.250.12.167    51.250.84.44     51.250.95.149
89.169.137.216   158.160.49.84    165.22.93.202    167.172.162.71
104.248.252.93   158.160.139.176  64.226.111.11    207.154.255.195
94.131.81.171
```

The list changes over time, so check the
[Webhook Endpoint docs](https://green-api.com/en/docs/api/receiving/technology-webhook-endpoint/)
before relying on it. Use it with the token, not as a replacement. Behind a
proxy such as Hookdeck, the source IP is the proxy's, so filter at the edge
instead.

## Common Gotchas

- **Comparing only the token.** The header is `Bearer <token>` or
  `Basic <token>`. Comparing it to the bare token always fails (401 on every
  webhook).
- **Scheme mismatch.** If you entered `Basic abc` in GREEN-API but store `abc`
  in your env, you'll expect `Bearer abc`. Store exactly what you entered.
- **Case.** Compare exactly (`Bearer`, not `bearer`). GREEN-API sends what
  you configured.
- **No token configured.** No `Authorization` header is sent at all. The
  examples fail closed (401) when `GREEN_API_WEBHOOK_URL_TOKEN` is unset.
- **Retries.** Non-2xx or unreachable endpoints are retried every minute for up
  to 24 hours. Return `200` fast and dedupe (see
  [overview.md](overview.md#event-payload-structure)).
- **No replay protection.** There's no signed timestamp. Rely on idempotency.

## Debugging Verification Failures

1. Log the received `Authorization` header's **scheme and length** (not the
   value) and compare them with what you expect.
2. Check the instance settings with `GetSettings`:
   `GET {apiUrl}/waInstance{idInstance}/getSettings/{apiTokenInstance}` and look
   at `webhookUrlToken`.
3. Make sure your env value has no trailing newline or quotes.
4. Point `webhookUrl` at `npx hookdeck-cli listen ...` and inspect the raw
   request headers in the CLI's web UI.
