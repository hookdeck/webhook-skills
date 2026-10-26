# How to Authenticate Bitdefender Webhooks

## How It Works

Bitdefender's jsonRPC push service **does not sign the body with a key you hold**. The
credential is the `Authorization` header:

```
Authorization: Bearer sfasdfw34243
```

`serviceSettings.authorization` is "a String representing the authorization header used to
authenticate in the third-party server" and is sent verbatim. Points that cause most failures:

- Paste the authorization value exactly as set in GravityZone, including any "Bearer " or
  "Basic " prefix. Compare the **whole header value** to `BITDEFENDER_AUTHORIZATION`.
- Do not strip, parse or base64-decode the prefix, even for `Basic`.
- The header is `Authorization` (Hookdeck's Bitdefender source compares it the same way).

## What a Static Credential Does Not Give You

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp). Anyone who captures one request can replay it or
send different bodies with the same header. Mitigate:

- Serve the endpoint over HTTPS only (GravityZone requires TLS 1.2+).
- Rotate the credential by calling `setPushEventSettings` again with a new
  `authorization`, and update `BITDEFENDER_AUTHORIZATION`, if it leaks.
- Make handlers idempotent, since a replay is indistinguishable from a retry.
- Optionally allowlist GravityZone's published Event Push IP addresses.

The push messages page also mentions an `Event-Push-Service-Md5` header
(`md5(api_key, md5(message_body))`) that can be used to check a request. These examples and
Hookdeck's source do not use it; it relies on MD5 and the documented sample is not
self-consistent, so confirm its behaviour against your tenant before relying on it.

## Implementation

There is no SDK. Verification is a constant-time string comparison. Hash both sides first so
the buffers are equal length: `timingSafeEqual` throws on a length mismatch otherwise.

### Node.js (Express)

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

app.post('/webhooks/bitdefender', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.BITDEFENDER_AUTHORIZATION;
  const received = req.headers['authorization'];
  if (!expected || !received || !safeEqual(received, expected)) {
    return res.status(401).end();
  }
  const message = JSON.parse(req.body.toString('utf8'));
  // message.params.events ...
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get('authorization'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.BITDEFENDER_AUTHORIZATION!)
```

### Python (FastAPI)

```python
import hmac

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

# headers.get("authorization") vs os.environ["BITDEFENDER_AUTHORIZATION"]
```

## Common Gotchas

- **Missing prefix**: the stored value must include `Bearer ` or `Basic ` if GravityZone sends it.
- **Unconfigured secret**: reject everything if `BITDEFENDER_AUTHORIZATION` is empty, otherwise
  an empty header would "match".
- **Raw body**: there is nothing to sign, but read the body raw and authenticate before parsing;
  `express.raw({ type: '*/*' })` accepts any content type.
- **Batches**: `params.events` is an array; handle every element, not just the first.
- **Non-2xx**: GravityZone treats any non-2xx or no response as an error.
- **Hookdeck**: a Hookdeck Bitdefender source checks the same header (full value).

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), without logging the values.
2. Confirm `Authorization` is present, then compare the length of the received value with the
   configured one (a missing `Bearer ` prefix shows up as a 7-character difference).
3. Check for trailing whitespace or quotes in `.env`.
4. Re-run `setPushEventSettings` with the value you expect and check `getPushEventSettings`.
