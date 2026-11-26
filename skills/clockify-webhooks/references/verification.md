# Clockify Webhook Verification

## The Scheme

| Part | Value |
|---|---|
| Header | `Clockify-Signature` (read it case-insensitively) |
| Value | The webhook's token (`authToken`, "Signing secret"), a non-expiring JWT issued by Clockify |
| Check | Constant-time equality with the stored token |
| Body signed? | No |
| Timestamp | None |

From the API docs: "Creating a webhook generates a new token which can be used to verify that the webhook being sent was sent by Clockify, as it will always be present in the header." Clockify's add-on docs: "The webhook token does not expire, and the same token registered for a particular webhook will be sent as part of the `clockify-signature` header for every webhook event of that type."

## Why It Isn't an HMAC

The value is the same for every delivery, whatever the body. A hex or base64 HMAC of the body will never match. Some third-party guides describe it as an HMAC, but published receivers compare the header to the stored token, and the header value itself is the JWT shown as `authToken`.

## Node.js

```javascript
const crypto = require('crypto');

const safeEqual = (a, b) => crypto.timingSafeEqual(
  crypto.createHash('sha256').update(a).digest(),
  crypto.createHash('sha256').update(b).digest());

function verifyClockifySignature(signature, tokens) {
  const given = String(signature || '').trim();
  if (!given || tokens.length === 0) return false;
  let ok = false;
  for (const token of tokens) ok = safeEqual(given, token) || ok;
  return ok;
}
```

Hashing both sides first gives equal-length buffers for `timingSafeEqual` and avoids leaking the token's length.

## Python

```python
import hashlib, hmac

def verify_clockify_signature(signature, tokens):
    given = (signature or "").strip()
    if not given or not tokens:
        return False
    results = [
        hmac.compare_digest(hashlib.sha256(given.encode()).digest(), hashlib.sha256(t.encode()).digest())
        for t in tokens
    ]
    return any(results)
```

## Add-on Webhooks

CAKE.com Marketplace add-ons receive the same header. Add-ons can also verify the JWT's signature with Clockify's public key and check its claims (`iss: clockify`, `sub`: the add-on key, `workspaceId`). Workspace webhooks only need the equality check.

## Debugging

| Symptom | Cause |
|---|---|
| Every request fails | You compute an HMAC. Compare the header to the token |
| One event type fails | That webhook has its own token. Add it to the list |
| Started failing | The Signing secret was reset, which invalidates the old token |
