# Facebook (Meta Graph API) Signature & Handshake Verification

Facebook webhooks require **two** kinds of verification:

1. A one-time **GET handshake** when the Callback URL is registered.
2. **Signature verification** on every `POST` delivery.

## 1. GET Verification Handshake

When you save the Callback URL, Meta sends a `GET` request with these query
parameters:

| Query param | Description |
|-------------|-------------|
| `hub.mode` | Always `subscribe` |
| `hub.verify_token` | The Verify Token you configured in the Dashboard |
| `hub.challenge` | A random string you must echo back |

Your endpoint must:

1. Confirm `hub.mode === 'subscribe'`
2. Confirm `hub.verify_token` matches your `FACEBOOK_VERIFY_TOKEN`
3. Respond `200` with the **raw `hub.challenge` value** as the plain-text body

If the token does not match, respond `403`.

```javascript
// GET /webhooks/facebook
if (mode === 'subscribe' && token === process.env.FACEBOOK_VERIFY_TOKEN) {
  return res.status(200).send(challenge); // echo challenge verbatim
}
return res.status(403).send('Forbidden');
```

## 2. POST Signature Verification

### How It Works

Meta signs the **raw** request body with **HMAC-SHA256** keyed on your **App
Secret** and sends the result in the `X-Hub-Signature-256` header, formatted as:

```
X-Hub-Signature-256: sha256=<hex-digest>
```

The legacy `X-Hub-Signature` header carries an **SHA-1** digest. Prefer the
SHA-256 header.

### Manual Verification (recommended)

The Meta Business SDKs do not include a webhook signature verifier, so compute
the HMAC yourself. This is the same scheme as GitHub webhooks.

Node.js:

```javascript
const crypto = require('crypto');

function verifyFacebookSignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader) return false;

  const [algo, sig] = signatureHeader.split('=');
  if (algo !== 'sha256' || !sig) return false;

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody) // raw bytes, NOT re-serialized JSON
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // length mismatch = invalid
  }
}
```

Python:

```python
import hmac
import hashlib

def verify_facebook_signature(raw_body: bytes, signature_header: str, app_secret: str) -> bool:
    if not signature_header:
        return False

    algo, _, sig = signature_header.partition("=")
    if algo != "sha256" or not sig:
        return False

    expected = hmac.new(
        app_secret.encode("utf-8"),
        raw_body,  # raw bytes, NOT re-serialized JSON
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(sig, expected)
```

## Common Gotchas

- **Use the raw body, not parsed JSON.** Meta signs an **escaped-unicode** form
  of the payload. If you re-serialize a parsed object (e.g. `JSON.stringify`),
  non-ASCII characters and spacing will differ and the HMAC will not match.
  Capture the raw bytes before any body parser runs.
- **Sign with the App Secret**, not a Page access token or the Verify Token.
- **Use `X-Hub-Signature-256`** (SHA-256), not the legacy `X-Hub-Signature`
  (SHA-1).
- **The header includes the `sha256=` prefix.** Strip it before comparing.
- **Compare timing-safe.** Use `crypto.timingSafeEqual` /
  `hmac.compare_digest`, and guard against length-mismatch exceptions.
- **The GET handshake uses the Verify Token; POST uses the App Secret.** They are
  two different secrets for two different steps.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Signature never matches | Verifying against parsed/re-serialized JSON instead of the raw body |
| Signature never matches | Using SHA-1 logic against the SHA-256 header, or vice versa |
| Signature never matches | Signing with the wrong secret (Verify Token instead of App Secret) |
| Handshake fails on save | GET handler not echoing `hub.challenge`, or Verify Token mismatch |
| `timingSafeEqual` throws | Compare hex-decoded buffers, or wrap in try/catch |
| No events after verify | App in Development mode, or Page not subscribed via `/{page-id}/subscribed_apps` |
