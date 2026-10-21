# Whop Signature Verification

## How It Works

Whop follows Standard Webhooks. Each request carries:

| Header | Value |
|--------|-------|
| `webhook-id` | Message id, stable across retries |
| `webhook-timestamp` | Unix seconds |
| `webhook-signature` | `v1,<base64>` (space-separated list if several) |

Signature = base64(HMAC-SHA256(key, `{webhook-id}.{webhook-timestamp}.{raw body}`)). The key is the **literal UTF-8 bytes of the `ws_...` secret**. Reject timestamps more than 5 minutes from now.

## Implementation

### SDK Verification (Node.js, Python)

```javascript
const { unwrapWebhook } = require('@whop/sdk/helpers'); // Next.js: import { unwrapWebhook } from '@whop/sdk/helpers'
const event = unwrapWebhook(rawBodyString, { headers, key: process.env.WHOP_WEBHOOK_SECRET });
```

```python
from whop_sdk.lib.verify_webhook import unwrap, WebhookVerificationError
event = unwrap(raw_body_bytes, headers=dict(request.headers), key=os.environ["WHOP_WEBHOOK_SECRET"])
```

Both throw on a bad or missing signature or stale timestamp. They return a plain parsed object, not a typed model.

### Manual Verification (fallback)

```python
import base64, hashlib, hmac, time

def verify(raw: bytes, headers: dict, secret: str) -> bool:
    msg_id, ts, sigs = (headers.get(h) for h in ("webhook-id", "webhook-timestamp", "webhook-signature"))
    if not (msg_id and ts and sigs) or abs(time.time() - int(ts)) > 300:
        return False
    signed = f"{msg_id}.{ts}.".encode() + raw
    expected = base64.b64encode(hmac.new(secret.encode(), signed, hashlib.sha256).digest()).decode()
    return any(
        v == "v1" and hmac.compare_digest(s, expected)
        for v, _, s in (p.partition(",") for p in sigs.split())
    )
```

## Common Gotchas

- **Do not base64-decode the secret or strip `ws_`.** The generic `standardwebhooks` library base64-decodes its key and throws on `ws_` secrets (`_` is not base64); pass `base64(utf8(secret))` to it, as the Whop SDK does.
- **Raw body only.** `request.text()` in Next.js, `express.raw({ type: '*/*' })` in Express, `await request.body()` in FastAPI.
- **Lowercase header names** in frameworks that normalize them; the SDKs look them up case-insensitively.
- **Legacy formats.** Webhooks using `api_version` `v2`/`v5` are not Standard Webhooks signed.

## Debugging Verification Failures

- Wrong or stale secret (the API shows it only once; copy it from the dashboard Secret column otherwise).
- Body parsed or re-serialized before verification.
- Proxy or middleware changes the body bytes.
- Server clock more than 5 minutes off.
- Test with the dashboard's "send test event" and compare against the delivery log.
