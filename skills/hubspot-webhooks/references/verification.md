# HubSpot Signature Verification

## How It Works

HubSpot signs every webhook with a v3 signature scheme:

1. HubSpot concatenates `HTTP method` + `request URI` + `raw request body` + `X-HubSpot-Request-Timestamp` (a millisecond Unix timestamp).
2. It computes `HMAC-SHA256(signed_content, client_secret)`.
3. It base64-encodes the digest and sends it in the `X-HubSpot-Signature-v3` header.

```
signedContent = method + uri + rawBody + timestamp
signature     = base64(HMAC-SHA256(signedContent, clientSecret))
```

The signing key is your **App Client Secret** (Application Secret) from the app's Auth tab.

You must also reject any request whose `X-HubSpot-Request-Timestamp` is older than **5 minutes** to mitigate replay attacks.

## Implementation

HubSpot does not ship an SDK helper for webhook verification, so all implementations are manual.

### Node.js

```javascript
const crypto = require('crypto');

const MAX_AGE_MS = 5 * 60 * 1000;

function verifyHubSpotWebhook({ method, uri, rawBody, timestamp, signature, secret }) {
  if (!signature || !timestamp || !secret) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_AGE_MS) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const signedContent = `${method}${uri}${body}${timestamp}`;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedContent, 'utf8')
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
```

### Python

```python
import hmac, hashlib, base64, time

MAX_AGE_MS = 5 * 60 * 1000

def verify_hubspot_webhook(method: str, uri: str, raw_body: bytes,
                           timestamp: str, signature: str, secret: str) -> bool:
    if not signature or not timestamp or not secret:
        return False
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    if abs(int(time.time() * 1000) - ts) > MAX_AGE_MS:
        return False

    signed_content = f"{method}{uri}{raw_body.decode('utf-8')}{timestamp}"
    expected = base64.b64encode(
        hmac.new(secret.encode('utf-8'), signed_content.encode('utf-8'), hashlib.sha256).digest()
    ).decode('utf-8')
    return hmac.compare_digest(expected, signature)
```

## Common Gotchas

### 1. Raw Body Required

The signature is computed over the **raw** request body, not parsed JSON. If your framework JSON-parses the body before you verify, re-serialization will produce a different byte sequence and verification will fail.

**Express:**
```javascript
// CORRECT - raw body
app.post('/webhooks/hubspot',
  express.raw({ type: 'application/json' }),
  (req, res) => { /* req.body is a Buffer */ });
```

### 2. Reconstruct the Exact URI HubSpot Signed

HubSpot signs the **URI it called**, including scheme, host, path, and query string. Behind a proxy, `req.protocol` and `req.host` may not reflect the public URL.

- Trust `X-Forwarded-Proto` and `X-Forwarded-Host` when running behind a proxy (`app.set('trust proxy', true)` in Express).
- The path should be URL-decoded except for the `?` separator (HubSpot's documented rule).
- Use `req.originalUrl` (Express) or the request's raw target — not a sanitized one.

If signatures fail in production but pass locally, the URI mismatch is almost always the cause.

### 3. Timestamp Tolerance

The `X-HubSpot-Request-Timestamp` is in **milliseconds**, not seconds. Reject anything older than 5 minutes from the current time.

```javascript
if (Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000) {
  return false; // stale
}
```

### 4. Base64, Not Hex

HubSpot uses base64 encoding for the digest. A `digest('hex')` call will never match.

```javascript
// WRONG
.digest('hex')

// CORRECT
.digest('base64')
```

### 5. Use the App Client Secret

Webhooks are signed with the **app Client Secret**, not a Private App access token, not the API key.

### 6. v1/v2 vs v3

| Version | Header | Algorithm | Status |
|---------|--------|-----------|--------|
| v1 | `X-HubSpot-Signature` | SHA-256 of `secret + body` | Deprecated |
| v2 | `X-HubSpot-Signature` (with `X-HubSpot-Signature-Version: v2`) | SHA-256 of `secret + method + URI + body` | Deprecated |
| v3 | `X-HubSpot-Signature-v3` | HMAC-SHA256 (base64) of `method + URI + body + timestamp` | **Use this** |

## Debugging Verification Failures

### Log the Inputs

```javascript
console.log('method:', req.method);
console.log('uri:', `${req.protocol}://${req.get('host')}${req.originalUrl}`);
console.log('timestamp:', req.headers['x-hubspot-request-timestamp']);
console.log('signature header:', req.headers['x-hubspot-signature-v3']);
console.log('body length:', req.body.length);
```

### Compare Hashes

```javascript
const signedContent = `${method}${uri}${body}${timestamp}`;
const expected = crypto.createHmac('sha256', secret).update(signedContent).digest('base64');
console.log('expected:', expected);
console.log('received:', signature);
console.log('match:', expected === signature);
```

### Verify the Secret

Confirm the secret matches the Client Secret from your app's **Auth** tab (not a Private App token). Rotating the secret in HubSpot invalidates all in-flight signatures immediately.

## Full Documentation

For complete verification details, see [Validating HubSpot Webhook Requests](https://developers.hubspot.com/docs/apps/legacy-apps/authentication/validating-requests).
