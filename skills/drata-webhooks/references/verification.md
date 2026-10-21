# How to Verify Drata Webhooks

## Does Drata Sign Its Webhooks?

Not in any way its documentation describes. The help center for the Send
webhook step says you can include "Authentication (as custom headers)" and
"Custom headers with additional context". It also says "Drata uses Svix to send
our webhooks", but it documents no `svix-id` / `svix-timestamp` /
`svix-signature` headers and no `whsec_` secret, so there's nothing to
verify cryptographically. Don't write HMAC code for a Drata signature.

| Question | Answer |
|---|---|
| Signature header | None documented |
| Algorithm | None documented |
| Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`) | Not documented |
| Authentication | Custom header(s) you configure in the step |
| IP allowlist | Not documented |

## How Do I Authenticate Drata Webhooks?

Add a secret to the step's custom headers and check it on every request:

1. Generate a value: `openssl rand -hex 32`.
2. In the Send webhook step, add header `X-Webhook-Secret: <value>`.
3. In your app, compare the header to `DRATA_WEBHOOK_SECRET` in constant time,
   before parsing the body.

### Node.js

```javascript
const crypto = require('crypto');

function verifyDrataSecret(headerValue) {
  const expected = process.env.DRATA_WEBHOOK_SECRET;
  if (!expected) throw new Error('DRATA_WEBHOOK_SECRET is not set');
  if (typeof headerValue !== 'string') return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hmac, os

def verify_drata_secret(header_value):
    expected = os.environ.get("DRATA_WEBHOOK_SECRET")
    if not expected:
        raise RuntimeError("DRATA_WEBHOOK_SECRET is not set")
    if header_value is None:
        return False
    return hmac.compare_digest(header_value.encode(), expected.encode())
```

## Common Gotchas

- **Fail closed.** If the secret isn't configured, return `500`, not `200`.
- **Length check.** `crypto.timingSafeEqual` throws when lengths differ, so
  compare lengths first (a length mismatch isn't a secret worth hiding here).
- **Header names are case-insensitive.** Express's `req.get`, `Headers.get` and
  Starlette's `request.headers` all handle this.
- **Use a plain value.** Avoid spaces and quotes in the secret.
- **Read the body raw.** Authentication doesn't depend on the body, but
  `express.raw({ type: '*/*' })` keeps your handler independent of the
  `Content-Type` Drata or a proxy sends.
- **`timestamp` isn't signed.** It's the event time in the body, so don't
  reject requests based on it. Make handlers idempotent instead.
- **Rotating the secret.** Edit the header on every Send webhook step that uses
  it, and accept both values briefly if you can't update them at once.

## How Do I Debug Authentication Failures?

| Symptom | Likely cause |
|---|---|
| `401` on every request | Header name or value differs (check `DRATA_WEBHOOK_HEADER`), or a proxy strips custom headers |
| `500` on every request | `DRATA_WEBHOOK_SECRET` isn't set in the environment |
| `400 Invalid JSON` | The request isn't the Drata body (a test tool, or a different URL) |
| `400 Missing event_type field` | The body lacks `event_type`; check the step's selected properties |
| Duplicate deliveries | Drata retried a failed step; dedupe on `event_type` + `control_id` + `timestamp` |

If Drata later documents a signature, switch to verifying that and keep the
header check as defence in depth.
