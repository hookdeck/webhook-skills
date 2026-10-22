# How to Authenticate Bringg Webhooks

## How It Works

Bringg webhooks **are not signed**: there is no HMAC, signature header or timestamp. Bringg lets
you add static headers (Key-Value pairs) to a webhook, "including static tokens for
authentication", and your receiver checks one of them:

| Setting in Bringg | Header received | Env vars in the examples |
|-------------------|-----------------|--------------------------|
| Headers: `Authorization` = `Bearer xxxxxxxxxxxx` | `Authorization: Bearer xxxxxxxxxxxx` | `BRINGG_WEBHOOK_HEADER=Authorization`, `BRINGG_WEBHOOK_SECRET=Bearer xxxxxxxxxxxx` |
| Headers: `application-key` = `xxxxxxxxxxxxxx` | `application-key: xxxxxxxxxxxxxx` | `BRINGG_WEBHOOK_HEADER=application-key`, `BRINGG_WEBHOOK_SECRET=xxxxxxxxxxxxxx` |

The header name is user-chosen. The examples look it up case-insensitively and compare the
**whole value**, so a `Bearer ` prefix is just part of the expected string (not parsed or
stripped). This matches Hookdeck's Bringg source, which verifies header name plus exact value.

Bringg also supports **JWT** and **OAuth 2.0** authentication methods for webhooks. They are
not handled here; verifying them needs custom code (validate the JWT in the configured
`signature_header`, or accept the token from your OAuth server).

## What This Does Not Give You

A static shared credential authenticates the sender, not the body, and provides **no replay
protection** (no signature and no timestamp). Anyone who captures a request can resend it, and
the body can't be proven untampered. So:

- Accept webhooks over HTTPS only
- Keep the secret out of logs and source control, and **rotate it in Bringg if it leaks**
- Make handlers idempotent (Bringg retries unconfirmed webhooks too)

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

function verifyBringgRequest(headers, config = process.env) {
  const secret = config.BRINGG_WEBHOOK_SECRET;
  if (!secret) return false;
  const name = (config.BRINGG_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[name];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

Hashing both sides gives equal-length buffers (so `timingSafeEqual` can't throw). Alternatively
check `a.length === b.length` first and compare equal-length Buffers directly. In Next.js,
`request.headers.get(name)` is already case-insensitive.

### Python (FastAPI)

```python
import hmac

def verify_bringg_request(headers, config) -> bool:
    secret = config.get("BRINGG_WEBHOOK_SECRET")
    if not secret:
        return False
    received = headers.get(config.get("BRINGG_WEBHOOK_HEADER") or "Authorization")
    if not received:
        return False
    # Encode both sides: compare_digest raises TypeError for non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Don't parse `Bearer`**: the expected value is the entire string you typed in Bringg.
- **Header name mismatch**: the Key is user-chosen; set `BRINGG_WEBHOOK_HEADER` to match. Names are case-insensitive, values are not.
- **Fail closed**: reject everything when `BRINGG_WEBHOOK_SECRET` is empty, or an unset env var becomes the "secret".
- **Authenticate before parsing**: read the body raw (`express.raw({ type: '*/*' })`) so any content type works, and `JSON.parse` only after the check.
- **Don't use `===`** on secrets; use a constant-time compare.

## Debugging 401s

1. Log (safely) which header names arrive. Is your Key among them?
2. Compare lengths of received and expected values. A stray space or missing `Bearer ` prefix is the usual cause.
3. Check the secret in the Bringg webhook's *Headers* section matches the env var exactly, and that the webhook was saved.
4. Behind a proxy or gateway, confirm it forwards your header unchanged.
