# Mailjet Webhook Authentication

## How Does Mailjet Authenticate Webhooks?

It doesn't sign them. There is no HMAC, no signature header, and no custom-header option. Mailjet recommends HTTPS plus Basic auth: credentials in the webhook URL are sent as

```
Authorization: Basic base64(username:password)
```

Anyone who learns the URL (and credentials) can send you events, so treat the password as a secret and rotate it by updating the URL in Mailjet.

## Implementation

### Express (Node.js)

```javascript
function verifyBasicAuth(header, username, password) {
  if (!header || !/^Basic /i.test(header)) return false;
  const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx < 0) return false;
  const userOk = safeEqual(decoded.slice(0, idx), username);
  const passOk = safeEqual(decoded.slice(idx + 1), password);
  return userOk && passOk;
}
```

`safeEqual` hashes both strings with SHA-256 and uses `crypto.timingSafeEqual`, so differing lengths neither throw nor leak.

### FastAPI (Python)

```python
user, sep, pwd = base64.b64decode(header[6:], validate=True).decode().partition(":")
ok = _safe_equal(user, username) & _safe_equal(pwd, password)  # hmac.compare_digest on SHA-256 digests
```

See `examples/*/` for the full handlers, which return `401` with `WWW-Authenticate: Basic` on failure and `500` if the credentials aren't configured.

## Common Gotchas

- **Reverse proxies may strip credentials or consume the header.** If a proxy or platform already does Basic auth, make sure `Authorization` still reaches the app, or authenticate there.
- **Split on the first colon only.** Usernames can't contain `:` but passwords can.
- **Compare both fields.** Don't return early after a username mismatch.
- **URL encoding.** Credentials with special characters must be percent-encoded in the registered URL; the decoded header carries the raw characters.
- **Failures are retried.** A `401` or `400` is a non-200 response, so Mailjet retries for 24 hours and may suspend the URL. Fix credentials quickly.
- **Don't parse before authenticating.** Use the raw body, then `JSON.parse` after the check. The body is an object, or an array when events are grouped.
- **Add defense in depth.** Restrict the endpoint to HTTPS and consider dedupe on `MessageID` + `event` + `time`.

## Debugging Authentication Failures

| Symptom | Likely Cause |
|---------|--------------|
| `401`, no `Authorization` header logged | Registered URL has no `user:pass@`, or a proxy removes the header |
| `401`, header present | Password has special characters not percent-encoded, or env vars differ from the URL |
| `500` from your endpoint | `MAILJET_WEBHOOK_USERNAME`/`PASSWORD` not set |
| Events stop arriving | URL suspended after repeated failures; update it with a new URL |
