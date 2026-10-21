# How to Authenticate Mailparser Webhooks

## Does Mailparser Sign Webhooks?

No. The Advanced Webhooks documentation lists no signature header, HMAC,
algorithm or timestamp. (Some third-party sources claim an HMAC header;
Mailparser's docs don't.) The supported mechanism is the **Additional
Headers** field, which adds fixed headers to every request. The docs' example
is HTTP Basic auth:

```
Authorization: Basic NTNkOWU1NjZjNzVmNmJmMGY5MmQ5YzJlNThmYWI5ZDVhZDJmYTMxZTo=
User-Agent: Mailparsr
```

## Implementation

Compare the whole received header value with the configured one in constant time.

### Node.js

```javascript
const crypto = require('crypto');
function verifyMailparserHeader(received, expected) {
  if (!received || !expected) return false;
  const a = Buffer.from(String(received), 'utf8');
  const b = Buffer.from(String(expected), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hmac
def verify_mailparser_header(received, expected):
    if not received or not expected:
        return False
    return hmac.compare_digest(received.encode(), expected.encode())
```

No SDK exists for Mailparser, so there is no SDK path; these manual compares
are the recommended approach. Nothing is signed over the body, so there is
no raw-body requirement, but the examples still read the raw body and
authenticate before parsing.

## Common Gotchas

- **Compare the whole value**, including `Basic ` for Authorization.
- **Header names are case-insensitive**; Node and Starlette lowercase them.
- **Length guard**: `timingSafeEqual` throws on unequal lengths.
- **Fail closed**: if no secret is configured, return 500, never accept.
- **No replay protection**: no timestamp or ID; deduplicate yourself.
- **Content type**: a "Form Data" webhook is not JSON; choose JSON in Mailparser.
- **Verb**: GET/PUT/DELETE are possible; the examples accept only POST.
- **Per-row mode** sends many requests per email, so expect bursts (use Webhook Delay if needed).

## Debugging Failures

| Symptom | Likely cause |
|---|---|
| 401 missing header | Header not saved under Additional Headers, or each header not on its own line |
| 401 invalid header | Secret differs (whitespace, missing `Basic `, wrong env var) |
| 500 not configured | `MAILPARSER_WEBHOOK_SECRET` unset |
| 400 invalid JSON | Content-Type is Form Data, or template renders invalid JSON (unescaped quotes in values) |
