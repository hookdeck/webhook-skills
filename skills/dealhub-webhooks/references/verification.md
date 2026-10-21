# How to Verify DealHub Webhooks

## How It Works

DealHub **does not sign webhooks**. There is no signature header, no HMAC, no
timestamp and no Standard Webhooks headers. Authentication is a static
credential in the `Authorization` header, set per webhook by its
**Authentication Type**
([How to Configure Webhooks → Authentication Types](https://developers.dealhub.io/docs/how-to-configure-webhooks#authentication-types)):

| Type | Header DealHub sends |
|---|---|
| Token | `Authorization: Bearer <TOKEN_SHARED_BY_ENDPOINT_PROVIDER>` |
| Basic | `Authorization: Basic <CREDENTIALS>` |
| None | none. For endpoints without auth, or with a SAS token in the URL |

## The Full-Value Caveat

DealHub sends the credential as the **full** `Authorization` header value:
`Bearer <TOKEN>` in Token mode, `Basic <CREDENTIALS>` in Basic mode.

So build the exact expected value, scheme and single space included, and
compare the **whole** header in constant time:

- Token: `"Bearer " + DEALHUB_WEBHOOK_TOKEN`
- Basic: `"Basic " + base64(DEALHUB_WEBHOOK_USERNAME + ":" + DEALHUB_WEBHOOK_PASSWORD)`

DealHub's docs don't spell out how `<CREDENTIALS>` is encoded. The examples
assume standard HTTP Basic (RFC 7617: base64 of `username:password`). If Basic
mode never matches, inspect the received header (e.g. in the Hookdeck CLI web
UI) and compare it with the value you built.

## Implementation

### SDK Verification

DealHub has no SDK with a webhook verification helper. Use your language's
constant-time compare.

### Manual Verification

**Node.js**

```javascript
const crypto = require('crypto');

function verifyDealhubAuthorization(header, expected) {
  if (!header || !expected) return false;
  const a = Buffer.from(header, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on different lengths, so check length first
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const expected = `Bearer ${process.env.DEALHUB_WEBHOOK_TOKEN}`;
verifyDealhubAuthorization(req.headers['authorization'], expected);
```

**Python**

```python
import hmac

def verify_dealhub_authorization(header, expected):
    if not header or not expected:
        return False
    return hmac.compare_digest(header.encode("utf-8"), expected.encode("utf-8"))

expected = f"Bearer {os.environ['DEALHUB_WEBHOOK_TOKEN']}"
verify_dealhub_authorization(request.headers.get("authorization"), expected)
```

## Common Gotchas

- **Comparing only the token.** Comparing the header to the bare token (or
  stripping `Bearer ` with a regex) is the most common mistake. Compare the
  full value.
- **Using `===` / `==`.** Plain string equality leaks timing. Use
  `crypto.timingSafeEqual` or `hmac.compare_digest`.
- **`timingSafeEqual` throws on length mismatch.** Guard lengths first, or a
  wrong-length header becomes a 500.
- **Failing open.** If no credential is configured, reject the request (the
  examples return 500) rather than skip the check.
- **No raw-body requirement.** Nothing is computed over the body, so parsing
  JSON first doesn't break authentication. The examples still authenticate
  before parsing.
- **No replay protection.** With no signature or timestamp, a captured request
  can be replayed. Deduplicate on `event_info.event_id`, and only use HTTPS.
- **Don't add a timestamp window.** DealHub sends no signed timestamp.

## Debugging Verification Failures

| Symptom | Likely cause |
|---|---|
| 401 "Missing Authorization header" | Webhook set to **None**, or a proxy strips `Authorization` |
| 401 in Token mode | Token in DealHub differs from `DEALHUB_WEBHOOK_TOKEN` (watch for trailing whitespace or newlines in `.env`) |
| 401 in Basic mode | Username/password mismatch, or Token mode configured on one side and Basic on the other |
| 500 "not configured" | Neither `DEALHUB_WEBHOOK_TOKEN` nor both Basic variables are set |

Log the **length** and scheme of the received header, never the value itself.
