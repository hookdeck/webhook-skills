# How to Authenticate Celcoin Webhooks

## How Does Celcoin Authenticate Webhooks?

Celcoin does **not** sign webhook payloads: there is no signature header, algorithm or timestamp. When you create a subscription with `"auth": {"type": "basic", "login": ..., "pwd": ...}`, Celcoin sends those credentials on every notification as:

```
Authorization: Basic base64(login:pwd)
```

Your endpoint authenticates the request by decoding that header and comparing it with the credentials you stored. JWT/OAuth 2.0 subscriptions (`auth.type` `jwt`) are a different mode and are not covered by Hookdeck's Celcoin source or this skill.

## What Does This Check Not Protect Against?

A static shared credential authenticates the **sender, not the body**, and gives **no replay protection** (no signature, no timestamp). Anyone who captures a request can replay it, or reuse the credential to send a different body. Mitigate this by:

- using HTTPS only,
- rotating the credential (update the subscription's `auth` and your environment variables) if it leaks,
- making handlers idempotent (see webhook-handler-patterns), keyed on `body.id` or similar.

## Implementation

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

function decodeStrictBase64(value) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  const buf = Buffer.from(value, 'base64');
  if (buf.toString('base64') !== value) return null; // junk after valid data
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return null; }
}

function verifyCelcoinAuth(authorization, username, password) {
  if (!username || !password || typeof authorization !== 'string') return false;
  const m = /^basic[ \t]+(\S+)$/i.exec(authorization.trim());
  const decoded = m && decodeStrictBase64(m[1]);
  if (decoded === null || decoded === undefined) return false;
  const i = decoded.indexOf(':');
  if (i === -1) return false;
  const userOk = safeEqual(decoded.slice(0, i), username);
  const passOk = safeEqual(decoded.slice(i + 1), password);
  return userOk && passOk;
}
```

Hashing both sides with SHA-256 gives equal-length buffers, so `timingSafeEqual` never throws and the credential length isn't leaked. (Checking lengths first and comparing equal-length Buffers also works.)

### Python (FastAPI)

```python
import base64, hmac, re

def verify_celcoin_auth(authorization, username, password) -> bool:
    if not username or not password or not authorization:
        return False
    m = re.match(r"^basic[ \t]+(\S+)$", authorization.strip(), re.IGNORECASE)
    if not m:
        return False
    try:
        decoded = base64.b64decode(m.group(1), validate=True).decode("utf-8")
    except ValueError:  # binascii.Error, UnicodeDecodeError, non-ASCII input
        return False
    if ":" not in decoded:
        return False
    user, _, pw = decoded.partition(":")  # split on the FIRST colon
    user_ok = hmac.compare_digest(user.encode(), username.encode())
    pass_ok = hmac.compare_digest(pw.encode(), password.encode())
    return user_ok and pass_ok
```

`hmac.compare_digest` takes bytes here: with `str` arguments it raises `TypeError` on non-ASCII input.

## Common Gotchas

- **Check the credential first, for every method.** Celcoin's docs don't name the HTTP method, so the examples accept GET, POST, PUT, PATCH and DELETE and authenticate before looking at the body. Hookdeck's Celcoin source pre-selects POST without managing the method, so allow any other method on the source too.
- **No 401 challenge.** Hookdeck never sends one (no `WWW-Authenticate` round trip), so the header must arrive with each request. Don't build a flow that depends on a challenge.
- **Split on the first colon.** The password may contain `:`; the username can't.
- **Strict base64.** Accept only the base64 alphabet and decode strictly, so valid credentials followed by junk are rejected. The scheme name (`Basic`) is case-insensitive.
- **Evaluate both comparisons.** Don't short-circuit between the username and the password.
- **Use the raw body.** In Express use `express.raw({ type: '*/*' })` so any content type works, authenticate, then parse. Handle an empty body.
- **Don't use JWT mode.** Hookdeck's Celcoin source doesn't cover `auth.type` `jwt`.
- **Fail closed.** If the environment variables are missing, reject (the examples return 500).

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Environment variables don't match the subscription's `login` / `pwd`, or the subscription was created with `auth.type` `jwt` |
| 401 after changing credentials | The subscription was updated but the endpoint (or Hookdeck source) still has the old values |
| 401 with a password containing `:` | The header was split on the last colon instead of the first |
| No notifications arrive | The subscription is `active: false`, the entity isn't subscribed, or `webhookUrl` is wrong (query with `GET .../webhook/subscription`) |
| Requests rejected by Hookdeck | The source only allows POST and Celcoin uses another method |
