# How to Verify Cartesia Webhooks

## How Does Cartesia Authenticate Webhooks?

Cartesia does not sign the payload (no HMAC, no timestamp). It sends the secret you set on the
webhook in the **`x-webhook-secret`** header of every delivery, raw with no prefix such as
`Bearer` or `sha256=`. Your endpoint authenticates the request by comparing that header to
`CARTESIA_WEBHOOK_SECRET`.

Because the body isn't signed, the secret is the only thing proving the sender. Use `https`
only, keep the secret out of logs, and rotate it by updating the webhook in Cartesia and your
environment together.

## Implementation

Cartesia's docs show a plain `!==` comparison. Use a constant-time compare instead.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);   // equal-length digests: never throws
}

const ok = Boolean(secret) && Boolean(req.headers['x-webhook-secret'])
  && safeEqual(req.headers['x-webhook-secret'], secret);
```

### Python

```python
import hashlib, hmac

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest()
    )

ok = bool(secret) and safe_equal(request.headers.get("x-webhook-secret", ""), secret)
```

## Common Gotchas

- **Header name case:** HTTP headers are case-insensitive. Node lowercases them; FastAPI's
  `request.headers` and `Headers.get()` are case-insensitive.
- **Refuse when unconfigured:** if `CARTESIA_WEBHOOK_SECRET` is empty, reject everything,
  otherwise an empty header would match an empty secret.
- **Hash or length-check before comparing:** `timingSafeEqual` / `compare_digest` on
  different-length inputs throws (Node) or leaks length. Hash both sides first.
- **Content type:** Cartesia sends JSON, but read the body raw (`express.raw({ type: '*/*' })`)
  so authentication never depends on a body parser.
- **401 is permanent:** Cartesia doesn't retry `401`. A mistyped secret loses events instead of
  delaying them. `403`, `408`, `429` and `5xx` are retried, so don't use those for bad auth.
- **Duplicates:** retries resend the same event. Dedupe on `webhook_request_id`.

## Debugging 401s

| Symptom | Cause |
|---------|-------|
| Every request 401 | `CARTESIA_WEBHOOK_SECRET` differs from the webhook's secret (check whitespace and trailing newlines in `.env`) |
| 401 only in production | Env var missing in the deploy, so the handler refuses all requests |
| Works with curl, fails from Cartesia | Webhook isn't attached to the agent, or the URL points at a different environment |
| Secret "lost" | Cartesia never returns it from the API; create a new webhook or update the secret |
