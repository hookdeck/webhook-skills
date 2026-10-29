# How to Verify Better Stack Webhook Requests

## How Does Better Stack Authenticate Webhooks?

It doesn't sign them. The create-webhook API's `custom_webhook_template_attributes` are
`http_method`, `auth_username`, `auth_password`, `headers_template` and `body_template`; none is a
signing secret. A webhook can carry two kinds of static credential:

```
Authorization: Basic base64(username:password)      # auth_username + auth_password
X-Better-Stack-Secret: <long random secret>         # a header you add to headers_template
```

There is no HMAC, timestamp or signed content. **A static shared credential authenticates the
sender, not the body, and gives no replay protection.** Anyone who captures a request can replay it,
and nothing ties the credential to a particular payload. Use HTTPS, use a long random value, keep it
out of logs and rotate it if it leaks.

## What Does the Handler Check?

It matches Hookdeck's Better Stack source, which offers Basic auth (the default) and a custom
header (an API key check). A request is accepted if **either configured** method passes:

1. **Custom header:** find the header named by `BETTER_STACK_WEBHOOK_HEADER` (default
   `X-Better-Stack-Secret`) case-insensitively and compare the **whole value** with
   `BETTER_STACK_WEBHOOK_SECRET` in constant time. No prefix is stripped and nothing is trimmed.
2. **Basic auth:** the `Authorization` scheme must be `Basic` (any case), the base64 must be
   strictly valid, the decoded UTF-8 is split on the **first** colon (a password may contain `:`),
   and the username and password are each compared with `BETTER_STACK_WEBHOOK_USERNAME` and
   `BETTER_STACK_WEBHOOK_PASSWORD` in constant time. Both are evaluated before deciding.
3. A method whose env vars are unset is never used. With neither configured, every request is
   rejected (fail closed).
4. Missing header, wrong scheme, malformed value or mismatch: `401`. The check runs first, for every
   HTTP method (`GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `OPTIONS`), before the body is read.

### Does Better Stack Send Basic Credentials Preemptively?

Better Stack's docs don't say whether Basic credentials go out on the first request or only after a
`401 WWW-Authenticate` challenge. Your handler, and Hookdeck's source, never answer with a
challenge. If Basic auth deliveries arrive without an `Authorization` header and get a `401`,
switch to the custom header, which doesn't depend on that behaviour.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

// Hash both sides: equal-length digests, so timingSafeEqual never throws.
const safeEqual = (a, b) =>
  crypto.timingSafeEqual(
    crypto.createHash('sha256').update(a).digest(),
    crypto.createHash('sha256').update(b).digest()
  );

function parseBasic(header) {
  const m = /^basic +([A-Za-z0-9+/]+={0,2})$/i.exec(header || '');
  if (!m || m[1].length % 4 !== 0) return null;
  const buf = Buffer.from(m[1], 'base64'); // lenient, so check it round-trips
  if (buf.toString('base64') !== m[1]) return null;
  const decoded = buf.toString('utf8');
  const i = decoded.indexOf(':'); // FIRST colon
  return i === -1 ? null : { username: decoded.slice(0, i), password: decoded.slice(i + 1) };
}

function verifyBetterStackRequest(headers, env = process.env) {
  const name = (env.BETTER_STACK_WEBHOOK_HEADER || 'X-Better-Stack-Secret').toLowerCase();
  const value = headers[name];
  const headerOk =
    Boolean(env.BETTER_STACK_WEBHOOK_SECRET) && typeof value === 'string' &&
    safeEqual(Buffer.from(value, 'latin1'), Buffer.from(env.BETTER_STACK_WEBHOOK_SECRET));

  let basicOk = false;
  const creds = parseBasic(headers['authorization']);
  if (creds && env.BETTER_STACK_WEBHOOK_USERNAME && env.BETTER_STACK_WEBHOOK_PASSWORD) {
    const userOk = safeEqual(Buffer.from(creds.username), Buffer.from(env.BETTER_STACK_WEBHOOK_USERNAME));
    const passOk = safeEqual(Buffer.from(creds.password), Buffer.from(env.BETTER_STACK_WEBHOOK_PASSWORD));
    basicOk = userOk && passOk; // evaluate both, no short-circuit
  }
  return headerOk || basicOk;
}
```

### Python

```python
import base64, hashlib, hmac, os, re

BASIC = re.compile(r"basic +([A-Za-z0-9+/]+={0,2})", re.IGNORECASE)

def safe_equal(a: bytes, b: bytes) -> bool:
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())

def parse_basic(header):
    m = BASIC.fullmatch(header or "")
    if not m or len(m.group(1)) % 4:
        return None
    try:
        raw = base64.b64decode(m.group(1), validate=True)
        decoded = raw.decode("utf-8")
    except ValueError:  # binascii.Error, UnicodeDecodeError
        return None
    if base64.b64encode(raw).decode("ascii") != m.group(1) or ":" not in decoded:
        return None  # canonical base64 only (b64decode ignores stray padding)
    username, _, password = decoded.partition(":")  # FIRST colon
    return username, password

def verify_better_stack_request(headers, env=os.environ) -> bool:
    # `headers` is case-insensitive (Starlette Headers). Starlette decodes values as latin-1.
    secret = env.get("BETTER_STACK_WEBHOOK_SECRET")
    value = headers.get(env.get("BETTER_STACK_WEBHOOK_HEADER") or "X-Better-Stack-Secret")
    header_ok = bool(secret) and value is not None and safe_equal(
        value.encode("latin-1"), secret.encode("utf-8")
    )

    basic_ok = False
    creds = parse_basic(headers.get("authorization"))
    user, password = env.get("BETTER_STACK_WEBHOOK_USERNAME"), env.get("BETTER_STACK_WEBHOOK_PASSWORD")
    if creds and user and password:
        user_ok = safe_equal(creds[0].encode(), user.encode())
        pass_ok = safe_equal(creds[1].encode(), password.encode())  # evaluate both
        basic_ok = user_ok and pass_ok
    return header_ok or basic_ok
```

## Common Gotchas

- **Don't expect a signature.** There is no `X-...-Signature` header to verify.
- **Basic credentials may not arrive.** See the preemptive-credentials note above; the custom
  header is the more robust choice.
- **Check every method first.** The webhook may use `get`, `post`, `put`, `patch`, `head` or
  `options`. Authenticate before reading the body, and acknowledge an authenticated request with no
  body with `200`.
- **Read the raw body.** The body is a user-editable template and no default `Content-Type` is
  documented. Read raw bytes (`express.raw({ type: '*/*' })`, `await request.arrayBuffer()`,
  `await request.body()`) and parse JSON only after the credential check.
- **Constant-time compare.** Check lengths or hash both sides before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes; a non-ASCII `str` raises
  `TypeError`.
- **Strict base64.** Node's `Buffer.from(x, 'base64')` skips invalid characters; validate the
  alphabet and padding, or compare a re-encoded value. Python needs `validate=True`.
- **Fail closed.** A method whose env vars are unset is rejected; with none set, everything is.
- **Hookdeck and methods.** The Better Stack source pre-selects `POST`. Allow any other method the
  webhook uses on the source (`GET`, `HEAD`, `PUT`, `PATCH`); `OPTIONS` can't be allowed, so don't
  use it for a webhook routed through Hookdeck.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request with the custom header | `BETTER_STACK_WEBHOOK_SECRET` unset, differs from the `headers_template` value, or `BETTER_STACK_WEBHOOK_HEADER` doesn't match the header name |
| 401 on every Basic request, header absent in the request log | Better Stack is not sending the Basic credentials preemptively (its docs don't say either way); use the custom header |
| 401 on every Basic request, header present | `BETTER_STACK_WEBHOOK_USERNAME` / `BETTER_STACK_WEBHOOK_PASSWORD` unset or different |
| 401 only behind a proxy | The proxy strips or rewrites `Authorization` or the custom header |
| 404/405 for one method only | The route doesn't handle that method, or the Hookdeck source doesn't allow it |
| 200 but nothing handled | The body is a custom template; check the log for "Unrecognised" or "non-JSON" |
