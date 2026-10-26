# How to Verify Paxos Webhook Requests

## How Does Paxos Authenticate Webhooks?

Paxos does **not** sign webhook events (no HMAC, no timestamp); its docs say signature verification is planned. With **Auth Type: API Key**, Paxos adds the header name and value you configured to every delivery:

```
X-Paxos-Webhook-Secret: <your value>
```

Your endpoint compares that header with the value you stored. The header name is user-chosen, so the examples read it from `PAXOS_WEBHOOK_HEADER` (default `Authorization`) and the expected value from `PAXOS_WEBHOOK_SECRET`.

## What Does This Protect Against?

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay protection**: there is no signature over the payload and no timestamp. Anyone who captures one request (or learns the credential) can replay it or send forged events. So:

- Accept the endpoint over HTTPS only.
- Rotate the credential if it leaks (create a new webhook, delete the old one).
- Treat events as notifications: fetch the full object with Get Event before acting, which also defeats forged payload contents.
- Dedupe on the event `id`.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyPaxosRequest(headers, secret = process.env.PAXOS_WEBHOOK_SECRET,
                            headerName = process.env.PAXOS_WEBHOOK_HEADER || 'Authorization') {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_paxos_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("PAXOS_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("PAXOS_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)  # Starlette/Django headers are case-insensitive
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Compare the whole value.** If you typed `Bearer abc` as the API Key, the header is `Bearer abc` and `PAXOS_WEBHOOK_SECRET` must be `Bearer abc`. Don't strip or parse the prefix.
- **Header name is yours.** If it isn't `Authorization`, set `PAXOS_WEBHOOK_HEADER`. Look it up case-insensitively (Node lowercases names).
- **Constant-time compare.** Hash both sides or check lengths before `timingSafeEqual`, which throws on unequal lengths. In Python, encode to bytes: `compare_digest` raises `TypeError` on non-ASCII `str`.
- **Fail closed.** If `PAXOS_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type works, then `JSON.parse` after the credential check.
- **Ignore test events.** `is_test: true` comes only from the Dashboard Test feature.
- **OAuth is different.** With OAuth auth, Paxos obtains a token from your OAuth server and sends it as a bearer token; this skill doesn't cover that.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `PAXOS_WEBHOOK_SECRET` unset, or `PAXOS_WEBHOOK_HEADER` differs from the Dashboard header name |
| 401 but values look equal | Missing `Bearer ` prefix, or trailing whitespace copied into the value |
| 401 only behind a proxy | The proxy strips or renames the header (common with `Authorization`) |
| 401 after rotating | Old webhook still active and sending the old credential |
| 400 after authentication | Body isn't a JSON object with a string `type` |
