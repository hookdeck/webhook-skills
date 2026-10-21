# How to Verify Unipile Webhooks

## Does Unipile Sign Webhooks?

No. Unipile's webhook documentation describes no signature, signing secret, HMAC
or timestamp header. Don't look for an `X-Unipile-Signature`. Instead the docs
say: "You can add header with a secret key to authenticate webhook coming from
Unipile", using the `headers` array when you create the webhook:

```json
"headers": [{ "key": "Unipile-Auth", "value": "yoursecretkey" }]
```

## How the Shared-Secret Header Works

1. Generate a long random value: `openssl rand -hex 32`.
2. Put it in the webhook's `headers` array under a key you choose
   (`Unipile-Auth` in Unipile's own example).
3. In your handler, read that header before parsing the body and compare it to
   `UNIPILE_WEBHOOK_SECRET` in constant time.

This proves the request came from someone who knows the secret. Unlike an HMAC,
it doesn't prove the body wasn't changed in transit, so always use HTTPS.

## Implementation

There's no Unipile SDK method for webhook verification. All three examples use
the same manual check.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function verifyUnipileSecret(headerValue) {
  const expected = process.env.UNIPILE_WEBHOOK_SECRET;
  if (!expected) throw new Error('UNIPILE_WEBHOOK_SECRET is not set'); // fail closed
  if (typeof headerValue !== 'string') return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const headerName = process.env.UNIPILE_WEBHOOK_HEADER || 'Unipile-Auth';
// Express:  verifyUnipileSecret(req.get(headerName))
// Next.js:  verifyUnipileSecret(request.headers.get(headerName))
```

### Python (FastAPI)

```python
import hmac
import os

def verify_unipile_secret(header_value: str | None) -> bool:
    expected = os.environ.get("UNIPILE_WEBHOOK_SECRET")
    if not expected:
        raise RuntimeError("UNIPILE_WEBHOOK_SECRET is not set")  # fail closed
    if header_value is None:
        return False
    return hmac.compare_digest(header_value.encode(), expected.encode())

# request.headers.get(os.environ.get("UNIPILE_WEBHOOK_HEADER") or "Unipile-Auth")
```

## Common Gotchas

- **No JSON content type.** Webhooks created through the API don't send
  `Content-Type: application/json` unless you add it to `headers`. Read the raw
  body and parse it yourself (`express.raw({ type: '*/*' })`), and never rely on a
  JSON body parser.
- **Check the secret before the body.** Reject with `401` first so an
  unauthenticated caller can't make you parse arbitrary input.
- **Fail closed.** If the secret isn't configured, return `500`. Never skip the
  check.
- **Length check before `timingSafeEqual`.** It throws when buffer lengths differ.
- **Account status payloads have no `event`.** Looking only at `payload.event`
  will make you reject them as malformed.
- **Respond fast.** Unipile expects a `200` within 30 seconds and retries five
  times otherwise.

## Debugging Verification Failures

| Symptom | Likely cause |
|---|---|
| Every request gets `401` | Header key in the webhook doesn't match `UNIPILE_WEBHOOK_HEADER`, or the secret value differs (check for trailing whitespace) |
| Every request gets `500` | `UNIPILE_WEBHOOK_SECRET` isn't set in the receiver's environment |
| `400 Invalid JSON` | The webhook was created with `format: "form"`, or something in front of your app re-encoded the body |
| Account status webhooks rejected as malformed | Handler requires an `event` field. Check for `AccountStatus` first |
| Same message handled twice | Unipile retried after a slow or non-200 response. Dedupe on `message_id` / `email_id` |
