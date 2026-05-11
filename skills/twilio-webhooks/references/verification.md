# Twilio Signature Verification

## How It Works

Twilio signs every webhook request with **HMAC-SHA1** using your **Auth Token** as the signing key, and sends the base64-encoded result in the `X-Twilio-Signature` header.

There are two signing variants depending on the request body:

### Form-encoded webhooks (`application/x-www-form-urlencoded`) — the default

The signed string is:

```
URL + concat(paramName + paramValue) for every POST parameter, sorted alphabetically by name
```

Then HMAC-SHA1 with the Auth Token, base64-encoded.

Example: if Twilio POSTs `MessageSid=SM123&From=%2B14155552671` to `https://example.com/webhooks/twilio`, the signed string is:

```
https://example.com/webhooks/twilioFrom+14155552671MessageSidSM123
```

(Parameters sorted by name; values are URL-**decoded** before concatenation.)

### JSON webhooks (`application/json`)

When Twilio sends JSON, it appends a `bodySHA256` query parameter to your configured URL:

```
https://example.com/webhooks/twilio?bodySHA256=<sha256-hex-of-raw-body>
```

The signed string is the **full URL only** (no body params concatenated). To verify:

1. Compute `sha256(raw_body)` as a hex string and confirm it matches the `bodySHA256` query value.
2. Compute `HMAC-SHA1(url, authToken)` base64 and compare to `X-Twilio-Signature`.

Both checks must pass.

## Implementation

### SDK Verification (recommended)

The official Twilio SDKs implement this algorithm correctly, including the two-variant case and a port-number quirk where Twilio sometimes signs with the default port (`:443`/`:80`) and sometimes without.

**Node.js — `twilio` package:**

```javascript
const twilio = require('twilio');

// Form-encoded webhooks
const isValid = twilio.validateRequest(
  process.env.TWILIO_AUTH_TOKEN,
  req.headers['x-twilio-signature'],
  `https://${req.headers.host}${req.originalUrl}`,
  req.body, // parsed form parameters
);

// JSON webhooks
const isValid = twilio.validateRequestWithBody(
  process.env.TWILIO_AUTH_TOKEN,
  req.headers['x-twilio-signature'],
  `https://${req.headers.host}${req.originalUrl}`,
  rawBody, // raw JSON body as a string
);
```

**Python — `twilio` package:**

```python
from twilio.request_validator import RequestValidator

validator = RequestValidator(os.environ["TWILIO_AUTH_TOKEN"])

# Form-encoded
is_valid = validator.validate(
    str(request.url),
    dict(await request.form()),
    request.headers.get("X-Twilio-Signature", ""),
)

# JSON — pass the raw body as a string; the URL must include the bodySHA256 query param Twilio added
is_valid = validator.validate(
    str(request.url),
    raw_body_string,
    request.headers.get("X-Twilio-Signature", ""),
)
```

### Manual Verification (form-encoded)

Useful as a fallback or for languages without an SDK:

```javascript
const crypto = require('crypto');

function verifyTwilioSignature(authToken, signature, url, params) {
  // Sort parameter names alphabetically, then concat name + value
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
```

### Manual Verification (JSON)

```javascript
const crypto = require('crypto');
const { URL } = require('url');

function verifyTwilioJsonSignature(authToken, signature, url, rawBody) {
  const bodyHash = crypto.createHash('sha256').update(rawBody, 'utf-8').digest('hex');
  const expectedBodyHash = new URL(url).searchParams.get('bodySHA256');
  if (expectedBodyHash !== bodyHash) return false;

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(url, 'utf-8'))
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
```

## Common Gotchas

### 1. The URL must match exactly what you configured

Twilio signs the URL string you registered, character for character. Mismatches cause silent verification failure:

- `http` vs `https`
- Trailing slash present vs absent
- Query parameters reordered
- Reverse proxy stripping or rewriting the path

If you're behind a proxy (Heroku, Vercel, Cloudflare, Hookdeck), reconstruct the URL from the original host and path your proxy forwarded — typically `X-Forwarded-Host` and `X-Forwarded-Proto`. The example apps in this skill use `req.headers.host` and `req.originalUrl`; adjust to your environment.

### 2. Use the Auth Token — not the Account SID

The signing key is your **Auth Token**. Using the Account SID will fail every time.

### 3. Don't parse the body before computing the JSON SHA-256

For JSON webhooks, you need the **raw bytes** of the body, exactly as Twilio sent them. Frameworks that auto-parse JSON (Express's `express.json()`, FastAPI's `await request.json()`) discard the original bytes — you must capture the raw body first.

### 4. Algorithm and encoding

- HMAC-**SHA1**, not SHA-256. (The `bodySHA256` query param uses SHA-256, but the outer signature is SHA-1.)
- The result is **base64**, not hex.

### 5. Use timing-safe comparison

```javascript
// VULNERABLE
if (computedSignature === receivedSignature) { ... }

// SAFE
crypto.timingSafeEqual(Buffer.from(computedSignature), Buffer.from(receivedSignature));
```

### 6. Port number quirk

Twilio's signature has historically been inconsistent about whether the URL includes the default port (`:443` for HTTPS, `:80` for HTTP). The official SDKs validate against both variants. If you implement manual verification and see intermittent failures, try both URL forms.

## Debugging Verification Failures

1. **Log the inputs.** Print the raw URL you reconstructed, the signature header, and the sorted parameters. Compare against what Twilio shows in the Console's webhook debugger.
2. **Verify the secret.** Make sure `TWILIO_AUTH_TOKEN` in your environment matches the Console — not the *test* Auth Token if you're using a live number.
3. **Reconstruct the URL correctly.** If you're behind a proxy, use the forwarded host/proto headers.
4. **Use the SDK.** If a manual implementation fails, swap in `twilio.validateRequest` / `RequestValidator.validate` to confirm the inputs themselves are correct.

## Full Documentation

- [Twilio webhook security](https://www.twilio.com/docs/usage/webhooks/webhooks-security)
- [`twilio-python` RequestValidator source](https://github.com/twilio/twilio-python/blob/main/twilio/request_validator.py)
- [`twilio-node` webhook validation](https://github.com/twilio/twilio-node)
