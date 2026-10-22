# How to Verify Lokalise Webhooks

## How It Works

Lokalise **does not sign requests**: there is no HMAC, timestamp or signature header. The docs
say so directly ("We do not sign the requests"). Authenticity comes from a shared secret that
Lokalise sends, unchanged, in a header on every delivery:

| Setting in the Webhooks app | Header | Env vars in the examples |
|-----------------------------|--------|--------------------------|
| Secret (default) | `X-Secret: <secret>` | `LOKALISE_WEBHOOK_SECRET`, `LOKALISE_WEBHOOK_HEADER=X-Secret` |
| Send as API key | `X-Api-Key: <value>` | `LOKALISE_WEBHOOK_HEADER=X-Api-Key` |
| Custom header | `<name>: <value>` | `LOKALISE_WEBHOOK_HEADER=<name>` |

Other headers on every delivery: `Project-Id`, `Webhook-Id`, `X-Event`. They identify the
source but are not secret, so don't use them for authentication.

## Implementation

There is no SDK; verification is a constant-time string comparison.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyLokaliseRequest(headers, config = process.env) {
  const secret = config.LOKALISE_WEBHOOK_SECRET;
  const headerName = (config.LOKALISE_WEBHOOK_HEADER || 'X-Secret').toLowerCase();
  if (!secret) return false;
  const received = headers[headerName];
  return Boolean(received) && safeEqual(received, secret);
}
```

In Next.js use `request.headers.get(headerName)` (case-insensitive).

### Python (FastAPI)

```python
import hashlib, hmac

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest()
    )

def verify_lokalise_request(headers, secret, header_name="X-Secret") -> bool:
    if not secret:
        return False
    received = headers.get(header_name.lower())
    return bool(received) and safe_equal(received, secret)
```

## Common Gotchas

- **Hash before comparing.** `timingSafeEqual` throws on different lengths and a plain `==`
  leaks timing. Hashing both sides to SHA-256 gives equal-length buffers.
- **Match the header you configured.** If you switched to `X-Api-Key` or a custom header,
  `X-Secret` is no longer sent. Set `LOKALISE_WEBHOOK_HEADER` accordingly.
- **Fail closed.** If the secret env var is empty, reject everything.
- **Read the body raw** (`express.raw({ type: '*/*' })`) so any content type is accepted.
  Authenticate first, then parse.
- **Ack the ping.** The creation ping needs a `2xx`. Authenticate it like any request, then
  return `200` even if the body isn't a JSON event.
- **Respond within 8 seconds.** Slower responses count as failures and are retried for 24
  hours, after which the handler is disabled. Queue slow work.
- **Optionally allowlist IPs.** Lokalise's outbound addresses (listed in the webhooks guide) are
  `3.67.82.138`, `3.123.244.162`, `3.124.254.35`, `18.185.175.152`, `18.192.113.205` and
  `18.194.146.34`. They're shared with all Lokalise outbound traffic and can change, so use
  them as an extra layer, not a replacement for the secret.
- **No replay protection.** With no timestamp signed, rely on idempotent handlers
  (`created_at_timestamp` plus the object ids make a workable key).

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `401` on every request | `LOKALISE_WEBHOOK_SECRET` doesn't match the app, or the secret was regenerated |
| `401` but the secret is right | Header mismatch: app sends `X-Api-Key` or a custom header, `LOKALISE_WEBHOOK_HEADER` says `X-Secret` |
| Webhook setup fails or the ping is reported failed | Ping got a non-2xx or timed out: check the URL, the secret and the 8 second limit |
| Webhook stopped firing | Handler failed for 24 hours and was disabled: re-enable it in project settings |
