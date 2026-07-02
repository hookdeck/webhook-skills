# Jira Signature Verification

## How It Works

When you register a **dynamic webhook** (via `POST /rest/api/3/webhook`) with a
`secret`, Jira Cloud uses that secret to compute an HMAC-SHA256 signature over the
**raw request body** and sends it in the `X-Hub-Signature` header, formatted per
the [WebSub](https://www.w3.org/TR/websub/#signing-content) standard as
`method=signature`:

```
X-Hub-Signature: sha256=a4771c39fbe90f317c7824e83ddef3caae9cb3d976c214ace1f2937e133263c9
```

- **Algorithm:** HMAC-SHA256
- **Encoding:** lowercase hex, prefixed with `sha256=`
- **Signed content:** the exact raw bytes of the request body

To verify, recompute the HMAC over the raw body with your secret and compare it
(timing-safe) against the hex portion of the header.

> **Not all Jira webhooks are signed.** Webhooks created through the Jira UI are
> **not** signed — they rely on HTTPS plus a hard-to-guess URL, optionally with a
> `?secret=<random>` query parameter you compare yourself. The `X-Hub-Signature`
> header is only present on dynamic webhooks registered with a `secret`.

## Implementation

Jira Cloud does not ship a first-party SDK method for webhook verification, so
verify manually with your language's standard crypto library. The algorithm is
identical across frameworks.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyJiraWebhook(rawBody, signatureHeader, secret) {
  const [method, sig] = (signatureHeader || '').split('=');
  if (method !== 'sha256' || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false; // buffer length mismatch = invalid
  }
}
```

### Python (FastAPI)

```python
import hmac, hashlib

def verify_jira_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    method, _, sig = (signature_header or "").partition("=")
    if method != "sha256" or not sig:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)
```

## Common Gotchas

- **Use the raw body, not parsed JSON.** Re-serializing parsed JSON changes byte
  order and whitespace, breaking the HMAC. Read the raw body first, verify, then
  parse. In Express use `express.raw({ type: 'application/json' })`; in Next.js
  use `await request.text()`; in FastAPI use `await request.body()`.
- **The header is `X-Hub-Signature`, not `X-Hub-Signature-256`.** Jira reuses the
  GitHub-style header name but *without* the `-256` suffix, even though the
  algorithm is SHA-256. HTTP header names are case-insensitive.
- **Strip the `sha256=` method prefix** before comparing. The header value is
  `sha256=<hex>`, not a bare hex string.
- **There is no event-type header.** Dispatch on the `webhookEvent` field in the
  JSON body, not a header.
- **UI webhooks are unsigned.** If `X-Hub-Signature` is absent, the webhook was
  likely created in the UI — fall back to a `?secret=` query parameter check or a
  network allowlist.
- **Compare timing-safe.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`
  and guard against buffer length mismatches.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Always fails | Verifying re-serialized JSON instead of the raw body |
| Header is `undefined`/`None` | Webhook created in UI (unsigned), or reading `x-hub-signature-256` instead of `x-hub-signature` |
| `timingSafeEqual` throws | Malformed hex in the header — catch and return `false` |
| Works locally, fails in prod | A proxy/body parser mutated the body before your handler read it |
