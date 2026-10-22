# How to Authenticate Socure RiskOS Webhooks

## How It Works

Socure does **not** sign webhook payloads: there is no signature header, HMAC or timestamp. Each
webhook is configured with an auth type and RiskOS includes the credentials in every outbound
request. With Basic auth the request carries:

```
Authorization: Basic base64(username:password)
```

Your endpoint verifies that header against the credentials you configured.

## Implementation

Node.js (see [examples/express/](../examples/express/) for the full handler):

```javascript
function parseBasicAuth(header) {
  const m = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(header || '');
  if (!m) return null;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':');            // split on the FIRST colon
  return i < 0 ? null : { username: decoded.slice(0, i), password: decoded.slice(i + 1) };
}

const creds = parseBasicAuth(req.headers.authorization);
if (!creds) return res.status(401).end();
const userOk = safeEqual(creds.username, process.env.SOCURE_WEBHOOK_USERNAME);
const passOk = safeEqual(creds.password, process.env.SOCURE_WEBHOOK_PASSWORD);
if (!(userOk && passOk)) return res.status(401).end(); // both evaluated, no short-circuit
```

Python (see [examples/fastapi/](../examples/fastapi/)):

```python
import base64, binascii, hashlib, hmac, os, re

_BASIC_RE = re.compile(r"^basic\s+([A-Za-z0-9+/]+={0,2})\s*$", re.IGNORECASE)


def safe_equal(a: bytes, b: bytes) -> bool:
    """Constant-time comparison (compare_digest on equal-length SHA-256 digests of bytes)."""
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())


def parse_basic_auth(header):
    """Parse 'Authorization: Basic base64(username:password)'.

    The scheme is case-insensitive and credentials split on the FIRST colon. Returns
    (username, password) as bytes, or None for a missing or malformed header.
    """
    if not isinstance(header, str):
        return None
    match = _BASIC_RE.match(header)
    if not match:
        return None
    try:
        decoded = base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError):
        return None
    username, sep, password = decoded.partition(b":")
    if not sep:
        return None
    return username, password


def verify_socure_request(headers, username=None, password=None) -> bool:
    """Socure RiskOS does not sign payloads. It sends the Basic credentials configured on
    the webhook with every request. Compare username and password each in constant time
    and evaluate both before deciding (no short-circuit).
    """
    username = username if username is not None else os.environ.get("SOCURE_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("SOCURE_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured
    creds = parse_basic_auth(headers.get("authorization"))
    if creds is None:
        return False
    user_ok = safe_equal(creds[0], username.encode("utf-8"))
    pass_ok = safe_equal(creds[1], password.encode("utf-8"))
    return user_ok and pass_ok
```

## Common Gotchas

- **No signature, no replay protection.** A static shared credential authenticates the sender,
  not the body, and gives no replay protection (no signature, no timestamp). Use HTTPS only,
  deduplicate on `event_id`, and rotate the credential if it leaks.
- **Constant-time compare.** Node: hash both sides with SHA-256 (or check lengths first) then
  `crypto.timingSafeEqual` on equal-length Buffers. Python: `hmac.compare_digest` on bytes. Never
  pass `str` (it raises on non-ASCII).
- **Evaluate both.** Compare username and password each, then combine; don't return early on the
  username.
- **Split on the first colon.** Passwords can contain `:`.
- **Scheme is case-insensitive** (`Basic`, `basic`).
- **No challenge flow.** Socure's docs don't say whether Basic credentials are sent preemptively.
  They must arrive on the first request; a `401` + `WWW-Authenticate` challenge won't work
  through Hookdeck, which verifies the request as received.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type works, and parse
  JSON only after the credential check.
- **Credentials are fixed.** RiskOS can't change auth credentials on an existing webhook; delete
  and recreate to rotate.
- **Bearer / OAuth 2.0.** Webhooks created with these send `Authorization: Bearer <token>`; this
  skill's Basic check rejects them.

## Debugging 401s

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Wrong env var names/values, or the webhook was created with Bearer or OAuth 2.0 |
| 401 only after rotating | Webhook credentials can't be edited; the new webhook has new ones, update env vars |
| 401 on the Dashboard test | Secret not loaded in the environment where the endpoint runs |
| 401 only with some passwords | Code splits on every colon, or compares `str` with non-ASCII |
| Test fails but curl works | Firewall/WAF blocking RiskOS source IPs |
