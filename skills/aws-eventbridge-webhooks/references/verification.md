# How to Verify Amazon EventBridge API Destination Requests

## Does EventBridge Sign Webhooks?

No. There is no signature header, no HMAC and no timestamp. With a Basic-auth Connection,
EventBridge sets `Authorization: Basic base64(username:password)` and you compare it with the
credentials you configured in the Connection.

> **A static shared credential authenticates the sender, not the body.** It gives no replay
> protection (no signature, no timestamp): anyone who captures a request can resend it, and the
> body can't be shown to be untampered beyond what TLS gives you. Use HTTPS, make handlers
> idempotent (dedupe on the envelope `id`), and rotate the credential if it leaks.

## Implementation

1. Read the `Authorization` header. Missing or not `Basic <base64>` (scheme case-insensitive): `401`.
2. Base64-decode it and split on the **first** colon (passwords may contain colons).
3. Compare the username and the password **each in constant time, evaluating both** before deciding.
4. Only then read and parse the body.

### Node.js

Check lengths or hash both sides, then `crypto.timingSafeEqual` on equal-length Buffers:

```javascript
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
const userOk = safeEqual(creds.username, username);
const passOk = safeEqual(creds.password, password);
return userOk && passOk; // both evaluated, no short-circuit
```

### Python

`hmac.compare_digest` on **bytes**. Never pass `str`: it raises `TypeError` on non-ASCII input.

```python
def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )

user_ok = safe_equal(username_received, USERNAME)
pass_ok = safe_equal(password_received, PASSWORD)
return user_ok and pass_ok
```

## Common Gotchas

- **Not POST-only**: the API destination method is configurable. Accept POST, PUT, PATCH, GET and
  DELETE on the route, and handle an empty body (GET and DELETE usually have none).
- **Any content type**: the default is `application/json; charset=utf-8`, but you can override it.
  Use `express.raw({ type: '*/*' })` in Express, `request.text()` in Next.js, `request.body()` in
  FastAPI, and parse JSON only after authenticating.
- **Input transformers**: the body is whatever the template builds, not necessarily the envelope.
- **Never accept when unconfigured**: if either env var is empty, reject every request.
- **401 is retried**: EventBridge retries `401`, `407`, `409`, `429` and `5xx`, so a credential
  mismatch produces repeated deliveries until retries run out. Other `4xx` codes are not retried.
- **5-second timeout**: acknowledge fast and do slow work asynchronously.
- **`User-Agent: Amazon/EventBridge/ApiDestinations`** is informational only. It is trivially
  spoofed and is not authentication.

## Debugging 401s

- Compare the Connection's username and password with your env vars exactly (whitespace, quoting).
- Check that the Connection is **Basic**, not API Key or OAuth.
- Confirm a proxy or framework isn't stripping the `Authorization` header.
- Test locally with `curl -u user:pass` against your endpoint.
- After rotating credentials, update the Connection and your env vars together.
