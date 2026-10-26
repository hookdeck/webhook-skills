# How to Verify Cloudentity (SecureAuth) Webhook Requests

## How Does Cloudentity Authenticate Webhooks?

Cloudentity (now SecureAuth) does not sign payloads. Each webhook invocation contains an
`X-API-Key` HTTP header with the unique Webhook API Key generated when you created the webhook.
The docs tell you to validate this key and accept only requests with the correct value (their
example is an Nginx `if ($http_x_api_key != '<webhook api key>') { return 403; }`).

```
X-API-Key: your-webhook-api-key
```

There is no HMAC, timestamp or prefix. Compare the **whole** header value with the stored key.

## Limits of a Static Key

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp). Anyone who captures one request can replay it, and the
key proves nothing about the content. So:

- Serve the endpoint over HTTPS only.
- Rotate the key (recreate the webhook) if it leaks, and update `CLOUDENTITY_WEBHOOK_API_KEY`.
- Deduplicate on each audit event's `event_id` so replays and retries are harmless.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyCloudentityRequest(headers, apiKey = process.env.CLOUDENTITY_WEBHOOK_API_KEY) {
  if (!apiKey) return false;
  const received = headers['x-api-key'];
  return Boolean(received) && safeEqual(received, apiKey);
}
```

### Python

```python
import hmac, os

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_cloudentity_request(headers, api_key=None) -> bool:
    api_key = api_key or os.environ.get("CLOUDENTITY_WEBHOOK_API_KEY")
    received = headers.get("x-api-key")
    return bool(api_key and received and safe_equal(received, api_key))
```

## Common Gotchas

- **Compare the whole value.** No prefix is added; don't trim or split the header.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `compare_digest` on bytes.
- **Fail closed.** If `CLOUDENTITY_WEBHOOK_API_KEY` is unset, reject everything.
- **The key is shown once.** If you lost it, create a new webhook and use its key.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the key check.
- **Batches.** The body holds many events in `audit_events`; handle each one.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `CLOUDENTITY_WEBHOOK_API_KEY` unset, or copied from another webhook |
| 401 after recreating the webhook | A new webhook has a new key; update the variable |
| 401 only behind a proxy | The proxy strips or renames `X-API-Key` |
| 400 after authentication | Body isn't JSON with an `audit_events` array |
