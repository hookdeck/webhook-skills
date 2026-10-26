# How to Authenticate Particle Webhook Requests

## Does Particle Sign Webhooks?

No. Particle webhook requests have no signature and no timestamp. The documented way to
authenticate is a custom header on the integration, typically `Authorization`
(`"headers": {"Authorization": "Bearer 12345"}`), or HTTP basic auth. The header name is whatever
you choose, so the examples read it from `PARTICLE_WEBHOOK_HEADER` (default `Authorization`) and
the expected value from `PARTICLE_WEBHOOK_SECRET`.

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.

## How Is the Header Compared?

- Look the header up case-insensitively.
- Compare the **whole** value. Do not strip or parse a `Bearer ` prefix: if you typed
  `Bearer 12345` in the integration, `PARTICLE_WEBHOOK_SECRET` is `Bearer 12345`. This matches
  Hookdeck's Particle source (API key verification with Header Name and the exact whole Header Value).
- Missing header or mismatch: `401`. Apply the check to every method before reading the body.
- Use a constant-time compare.

### Node.js

```javascript
const crypto = require('crypto');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest();

function verifyParticleRequest(headers, secret = process.env.PARTICLE_WEBHOOK_SECRET,
                               headerName = process.env.PARTICLE_WEBHOOK_HEADER || 'Authorization') {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  if (!received) return false;
  return crypto.timingSafeEqual(
    sha256(Buffer.from(received, 'latin1')),
    sha256(Buffer.from(secret, 'utf8'))
  );
}
```

### Python

```python
import hmac, os

def verify_particle_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("PARTICLE_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("PARTICLE_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)
    if not secret or not received:
        return False
    return hmac.compare_digest(received.encode("latin-1"), secret.encode("utf-8"))
```

## Common Gotchas

- **Static values only.** Use a static header value, not a mustache variable. A templated value
  differs per request and can't be verified.
- **Whole-value compare.** Don't parse `Bearer`; include it in the secret if you typed it.
- **Bytes, not str, in Python.** `hmac.compare_digest` raises `TypeError` on non-ASCII `str`.
- **Any method.** `requestType` can be GET, POST, PUT or DELETE. Authenticate all of them, and
  tolerate an empty body (GET and DELETE have none).
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) and parse after the check: form-encoded
  by default, or JSON.
- **Basic auth.** Particle supports it, but Hookdeck's Particle source doesn't; use a custom header.
- **Fail closed.** If `PARTICLE_WEBHOOK_SECRET` is unset, reject everything.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret unset, wrong header name, or the `Bearer ` prefix is missing from the secret |
| 401 only on some requests | Header value contains a mustache variable that changes per request |
| 401 only on GET/PUT/DELETE | Route or middleware only checks POST |
| 400 after authentication | Malformed JSON, or a JSON body that isn't an object |
| Works direct, fails via Hookdeck | The method isn't allowed on the Particle source in Hookdeck |
