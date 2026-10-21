# How to Verify Polar Webhook Signatures

## How It Works

Polar implements the [Standard Webhooks](https://www.standardwebhooks.com/) specification. Every
request includes three headers:

| Header | Description |
|--------|-------------|
| `webhook-id` | Unique message ID for this delivery |
| `webhook-timestamp` | Unix timestamp (seconds) when the message was sent |
| `webhook-signature` | Space-separated list of versioned signatures, e.g. `v1,<base64>` |

The signature is computed as:

```
signedContent = `${webhook-id}.${webhook-timestamp}.${body}`
signature      = base64( HMAC_SHA256(key, signedContent) )
webhook-signature header = `v1,${signature}`
```

Where `body` is the **raw** request body (exact bytes received) and `key` is the HMAC key
derived from your secret (see the base64 gotcha below).

The `webhook-signature` header may contain multiple space-separated signatures (e.g. during
secret rotation). Verification passes if **any** one matches.

## The base64 secret gotcha

The Standard Webhooks spec expects the signing key to be **base64-decoded** from the secret
before use. Polar's dashboard secrets are plain strings (user-set or randomly generated, not
`whsec_`-prefixed), so the SDKs **base64-encode your secret first**, then the underlying
Standard Webhooks library base64-decodes it back — meaning the effective HMAC key is the raw
UTF-8 bytes of your dashboard secret.

Practical consequences:

- **Using the SDK:** pass your dashboard secret as-is. The SDK handles the base64 dance.
- **Verifying manually:** either (a) HMAC directly with the raw secret bytes as the key, or
  (b) base64-encode the secret and feed it to a Standard Webhooks library. Both produce the same
  result. The manual examples below use approach (a).

## Implementation

### SDK Verification (recommended)

**Node.js (`@polar-sh/sdk`):**

```javascript
const { validateEvent, WebhookVerificationError } = require('@polar-sh/sdk/webhooks');

try {
  const event = validateEvent(
    rawBody,                         // Buffer or string of the raw HTTP body
    req.headers,                     // the request headers object
    process.env.POLAR_WEBHOOK_SECRET // dashboard secret, as-is
  );
  // event.type, event.data
} catch (err) {
  if (err instanceof WebhookVerificationError) {
    // invalid signature
  }
}
```

**Python (`polar-sdk` 1.x):**

Webhook models are versioned by Polar API version; import from the module matching your
endpoint's API version (`polar.v2026_10` here).

```python
from polar.v2026_10.webhooks import (
    validate_event,
    PolarWebhookError,
    PolarWebhookUnknownTypeError,
    PolarWebhookVerificationError,
)

try:
    event = validate_event(
        raw_body,                               # bytes of the raw HTTP body
        dict(request.headers),
        os.environ["POLAR_WEBHOOK_SECRET"],
    )
except PolarWebhookVerificationError:
    ...  # invalid signature
except PolarWebhookUnknownTypeError:
    ...  # authentic, but an event type this API version doesn't model -> acknowledge with 2xx
except PolarWebhookError:
    ...  # authentic, but the payload doesn't parse
```

`polar-sdk` 0.x used `from polar_sdk.webhooks import validate_event, WebhookVerificationError`;
1.0 renamed the package to `polar` and the exceptions to `PolarWebhook*Error`.

### Manual Verification (fallback)

Use when no SDK is available. This mirrors exactly what the SDK does. The HMAC key is the raw
UTF-8 bytes of the dashboard secret.

```python
import hmac, hashlib, base64, time

def verify_polar_signature(body: bytes, headers, secret: str, tolerance: int = 300) -> bool:
    webhook_id = headers.get("webhook-id")
    webhook_timestamp = headers.get("webhook-timestamp")
    webhook_signature = headers.get("webhook-signature")
    if not (webhook_id and webhook_timestamp and webhook_signature):
        return False

    # Reject stale timestamps to prevent replay attacks
    if abs(int(time.time()) - int(webhook_timestamp)) > tolerance:
        return False

    signed_content = f"{webhook_id}.{webhook_timestamp}.".encode() + body
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).digest()
    ).decode()

    # Header is a space-separated list of `v1,<sig>` entries
    for part in webhook_signature.split(" "):
        _, _, sig = part.partition(",")
        if hmac.compare_digest(sig, expected):  # timing-safe
            return True
    return False
```

## Common Gotchas

- **Raw body required.** Verify against the exact bytes received. In Express use
  `express.raw({ type: 'application/json' })`; in Next.js use `await request.text()`; in FastAPI
  use `await request.body()`. Never `JSON.parse`/`json.loads` before verifying.
- **Base64-encode the secret** (or let the SDK do it). Polar secrets are not `whsec_`-prefixed.
- **Timestamp tolerance.** Standard Webhooks rejects messages outside a ~5-minute window to
  prevent replay. Ensure your server clock is accurate.
- **Header casing.** HTTP headers are case-insensitive; most frameworks lowercase them
  (`webhook-id`). Read them case-insensitively.
- **Only the Raw endpoint format** sends verifiable payloads — Discord/Slack formats do not.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Always fails, valid-looking payload | Body was parsed/re-serialized before verifying — use the raw body |
| Fails with SDK, passes manually (or vice-versa) | Double base64-encoding the secret — pass it as-is to the SDK |
| Intermittent failures | Server clock drift beyond the timestamp tolerance |
| Missing headers | Endpoint format is Discord/Slack instead of Raw |
