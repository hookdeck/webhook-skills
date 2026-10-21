# How to Verify Dynamics 365 (Dataverse) Webhooks

## Does Dataverse Sign Webhooks?

No. Microsoft's webhook documentation describes no signature, signing secret,
HMAC or timestamp header. Don't look for headers like these; none are documented:

- `X-Signature`
- `x-ms-signature`
- `X-Hub-Signature`

Instead, the webhook registration has an **authentication option**, and the
endpoint is responsible for rejecting requests where it doesn't match:
"Any request to the configured endpoint should fail when the authentication
options passed in the request don't match. The endpoint is responsible for this
condition."

| Option | Wire format | Recommendation |
|---|---|---|
| **HttpHeader** | Key/value pairs as headers, e.g. `X-Webhook-Secret: <value>` | **Use this.** |
| **WebhookKey** | `?code=<value>` | Secret in the URL: ends up in logs. Avoid. |
| **HttpQueryString** | `?Key1=Value1` | Same problem. Avoid. |

## How the Shared-Secret Header Works

1. Generate a long random value: `openssl rand -hex 32`.
2. Register it as an HttpHeader pair, e.g. `X-Webhook-Secret: 3f9c0e7b...`.
3. In your handler, read the header before parsing the body and compare it to
   `DYNAMICS_WEBHOOK_SECRET` in constant time.

This proves the request came from someone who knows the secret. Unlike an HMAC,
it doesn't prove the body wasn't altered in transit, so always use HTTPS.

## Implementation

There's no SDK step: Dataverse's SDK (`Microsoft.Xrm.Sdk`) can deserialize a
`RemoteExecutionContext`, but it has nothing to verify. Use the manual check.

### Node.js

```javascript
const crypto = require('crypto');

function verifyDynamicsSecret(headerValue) {
  const expected = process.env.DYNAMICS_WEBHOOK_SECRET;
  if (!expected) throw new Error('DYNAMICS_WEBHOOK_SECRET is not set'); // fail closed
  if (typeof headerValue !== 'string') return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hmac, os

def verify_dynamics_secret(header_value: str | None) -> bool:
    expected = os.environ.get("DYNAMICS_WEBHOOK_SECRET")
    if not expected:
        raise RuntimeError("DYNAMICS_WEBHOOK_SECRET is not set")  # fail closed
    if header_value is None:
        return False
    return hmac.compare_digest(header_value.encode(), expected.encode())
```

## Common Gotchas

- **A 401 on a synchronous step blocks the user.** If the secret is wrong or
  rotated on one side only, every save in the registered table fails with
  "Endpoint unavailable". The examples check a single secret, so update the
  app and the registration together, or extend the check to accept the old
  and new values during the switch.
- **The registered secret can't be read back.** Keep it in your secret store.
- **Header names are case-insensitive**, so `x-webhook-secret` matches.
- **Don't parse the body first.** Check the header, then read the body. Use the
  raw body for any content type; don't rely on `application/json` middleware.
- **Fail closed.** If the secret env var is missing, return `500`, not `200`.
- **Don't log the secret** or echo the header back in an error.
- **No replay protection.** There's no timestamp. Dedupe on `OperationId` and
  `OwningExtension.Id` instead.

## Debugging Verification Failures

| Symptom | Likely cause |
|---|---|
| Always `401` | Header key mismatch (check `DYNAMICS_WEBHOOK_HEADER`), or the value has a trailing space/newline |
| Always `500` | `DYNAMICS_WEBHOOK_SECRET` isn't set in the app |
| "Endpoint unavailable" in the UI | Synchronous step and your endpoint returned non-2xx or timed out (60 s) |
| Failed System Job, no request reached you | Endpoint isn't on port 80/443, or TLS/DNS problem |
| Header never arrives | Registered with WebhookKey or HttpQueryString, so the credential is in the URL |
