# Authenticating Zoho Flow Webhooks

## Does Zoho Flow Sign Send Webhook Requests?

No. A Send Webhook request carries what you configured and nothing else: no signature, timestamp or delivery ID. Authenticate it with a secret header that the action sends and your endpoint checks.

## How the Check Works

1. Send the secret in a **header**: an API Key auth profile with header placement, or a header Param Name / Param Value on an action with No Authentication.
2. On receipt, look the header up by name, case-insensitively.
3. Compare the **whole** value with your stored secret in constant time.
4. Missing or different: `401`. Secret not configured on your side: `500`, never accept.
5. Only then parse the body (or the query string, for `GET`).

## Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  // SHA-256 both sides so the buffers have equal length and timingSafeEqual can't throw.
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyZohoFlowRequest(headers, name, secret) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()]; // Express/Node lowercases incoming header names
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

In Next.js, `request.headers.get(name)` is already case-insensitive.

## Python

```python
import hmac
from typing import Mapping, Optional

def verify_zoho_flow_request(headers: Mapping[str, str], name: str, secret: Optional[str]) -> bool:
    if not secret:
        return False
    received = headers.get(name)  # Starlette headers are case-insensitive
    if not received:
        return False
    # Compare bytes: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Header, Body or Query?

An API Key auth profile can place the key in a header, the body or the query string. Use the header:

- A header check (and Hookdeck's Zoho Flow source type) only looks at headers.
- Query strings end up in access logs, proxy logs and browser history.
- A key in the body forces you to parse an untrusted body before you know who sent it.

## What a Header Check Doesn't Give You

- **No body integrity.** Anyone who has the secret can send any body. It authenticates the sender only.
- **No replay protection.** There's no timestamp or nonce, so a captured request can be replayed. Use HTTPS and make handlers idempotent.
- **No rotation overlap.** Flow sends one value. To rotate, accept old and new values briefly.

## Hookdeck

The Zoho Flow source type (`ZOHO_FLOW`) performs the same check: you enter the header name and value on the source. Verification is optional on the source, and there's no timestamp to check. Hookdeck forwards the headers it received, so the check in your handler keeps working behind it.

## Debugging 401s

| Symptom | Cause |
|---------|-------|
| Header missing entirely | The auth profile places the key in the body or query. Use a profile with header placement. |
| Header missing entirely | The action uses a different connection, or No Authentication without the header field. |
| Value never matches | The stored secret has a trailing newline or space, or a `Bearer ` prefix on one side only. Compare the exact value. |
| Works in tests, fails from Flow | `ZOHO_FLOW_WEBHOOK_HEADER` names a different header than the profile's Parameter Name. |
| `GET` requests have no data | `GET` data is in the query string, not the body. |

Click **Test** on the action and log the received header **names** (not values) to see what Flow sent.
