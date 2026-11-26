# Authenticating Zoho CRM Webhooks

## Does Zoho CRM Sign Webhooks?

No. Zoho CRM workflow webhooks carry no signature, timestamp or delivery ID. The only way to tell a real request from a forged one is a secret you configure on the webhook and check on receipt. Zoho documents Custom Parameters under Header for exactly this: "this key/value pair is mainly used to send the Auth tokens, security tokens, API key, etc."

## How the Check Works

1. Add a Custom Parameter under the webhook's **Header**, e.g. `X-Webhook-Secret: <long random value>`.
2. Use **POST** or **PUT**. The [create-webhook API reference](https://www.zoho.com/crm/developer/docs/api/v8/create-webhook.html) says headers are "applicable only for POST and PUT requests"; GET and DELETE send parameters in the URL only.
3. On receipt, look the header up by name, case-insensitively.
4. Compare the **whole** value with your stored secret in constant time.
5. Missing or different: `401`. Secret not configured on your side: `500`, never accept.
6. Only then parse the body.

## Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  // SHA-256 both sides so the buffers have equal length and timingSafeEqual can't throw.
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyZohoCrmRequest(headers, name, secret) {
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

def verify_zoho_crm_request(headers: Mapping[str, str], name: str, secret: Optional[str]) -> bool:
    if not secret:
        return False
    received = headers.get(name)  # Starlette headers are case-insensitive
    if not received:
        return False
    # Compare bytes: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## What a Header Check Doesn't Give You

- **No body integrity.** Anyone who has the secret can send any body. It authenticates the sender only.
- **No replay protection.** There's no timestamp or nonce, so a captured request can be replayed. Use HTTPS (Zoho only allows ports 80 and 443; use 443) and make handlers idempotent.
- **No rotation overlap.** Zoho sends one value. To rotate, accept old and new values briefly, update the Custom Parameter, then drop the old one.

## Hookdeck

The Zoho CRM source type (`ZOHO_CRM`) performs the same check: you enter the header name and value on the source. Verification is optional on the source, and there's no timestamp to check. Hookdeck forwards the headers it received, so the check in your handler keeps working behind it.

## The Notifications API Isn't Covered

Callbacks from the notifications API (`/actions/watch`) carry a `token` in the **body**, not a header. Neither these examples nor Hookdeck's Zoho CRM source type check it. If you use that API, parse the body and compare `token` in constant time yourself.

## Debugging 401s

| Symptom | Cause |
|---------|-------|
| Header missing entirely | The webhook uses GET or DELETE. Switch to POST or PUT. |
| Header missing entirely | The parameter was added under Body (form-data Custom Parameter) instead of Header. |
| Value never matches | The stored secret has a trailing newline or space, or you typed `Bearer ` on one side only. Compare the exact value. |
| Works in tests, fails from Zoho | `ZOHO_CRM_WEBHOOK_HEADER` names a different header than the Parameter Name in Zoho. |
| Webhook won't save with a header | Zoho requires at least one Module Parameter in the header section when headers are set. |
| Nothing arrives | The rule's criteria didn't match, the daily limit was hit, or the URL uses a port other than 80/443. |

Log the received header **names** (not values) to see what Zoho actually sent.
