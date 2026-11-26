# SurveyMonkey Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Header | `Sm-Signature` |
| Algorithm | HMAC-SHA1, base64 (28 characters) |
| Key | The literal string `<client ID>&<client secret>` (old auth: `<API key>&<API secret>`), UTF-8 |
| Signed content | The raw body, "exactly as you received it" |
| Timestamp | None |

SurveyMonkey's Python sample:

```python
signature = hmac.new(
    key=('%s&%s' % (api_key, api_secret)).encode('utf-8'),
    msg=undecodedPayload.encode('utf-8'),
    digestmod=hashlib.sha1)
return base64.b64encode(signature.digest()).decode('utf-8')
```

Its Node sample reads the client ID from the `Sm-Apikey` header and compares `Buffer.from(sig, 'base64')` with the digest using `crypto.timingSafeEqual`. The examples use the configured client ID instead of the header, so the key never depends on request input.

## Node.js

```javascript
const crypto = require('crypto');

function verifySurveyMonkeySignature(rawBody, signature, clientId, clientSecret) {
  const value = String(signature || '').trim();
  if (!clientId || !clientSecret || !/^[A-Za-z0-9+/]{27}=$/.test(value)) return false;
  const expected = crypto.createHmac('sha1', `${clientId}&${clientSecret}`).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'base64'), expected);
}
```

## Python

```python
import base64, hashlib, hmac, re

def verify_surveymonkey_signature(raw_body: bytes, signature: str, client_id: str, client_secret: str) -> bool:
    value = (signature or "").strip()
    if not client_id or not client_secret or not re.fullmatch(r"[A-Za-z0-9+/]{27}=", value):
        return False
    expected = hmac.new(f"{client_id}&{client_secret}".encode("utf-8"), raw_body, hashlib.sha1).digest()
    return hmac.compare_digest(base64.b64decode(value), expected)
```

## The HEAD Check

The `HEAD` request on webhook creation (and on `PUT` and `PATCH`) has no body and no signature. Answer it with `200` and don't treat it as an event. `?bypass_ping=true` skips it.

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| Every request fails | The key is the secret alone. Use `<client ID>&<client secret>` |
| Every request fails, right key | The body was parsed and re-serialised. HMAC the raw bytes |
| Body is empty in your handler | Your JSON parser skipped the `application/vnd.surveymonkey...+json` Content-Type. Read the raw body |
| Creating the webhook fails | The URL didn't answer `HEAD` with `200`. Add a `HEAD` route, or pass `?bypass_ping=true` |
| Creating a second webhook fails | Each `subscription_url` must be unique in the account. Add a query string |
