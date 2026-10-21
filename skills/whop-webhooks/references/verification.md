# Whop Signature Verification

## How It Works

Whop follows Standard Webhooks. Each request carries:

| Header | Value |
|--------|-------|
| `webhook-id` | Message id, stable across retries |
| `webhook-timestamp` | Unix seconds |
| `webhook-signature` | `v1,<base64>` (space-separated list if several) |

Signature = base64(HMAC-SHA256(key, `{webhook-id}.{webhook-timestamp}.{raw body}`)). The key is the **literal UTF-8 bytes of the `ws_...` secret**. Optionally reject timestamps more than 5 minutes from now; the examples leave this off by default because Hookdeck retries and replays keep the original timestamp (set `WHOP_TIMESTAMP_TOLERANCE_SECONDS` to opt in).

## Implementation

### Manual Verification (used by the examples)

```python
import base64, hashlib, hmac, time

def verify(raw: bytes, headers: dict, secret: str, tolerance: int = 0) -> bool:
    # tolerance = 0 (default) skips the timestamp window; a positive value opts in
    msg_id, ts, sigs = (headers.get(h) for h in ("webhook-id", "webhook-timestamp", "webhook-signature"))
    if not (msg_id and ts and ts.isdigit() and sigs):
        return False
    if tolerance > 0 and abs(time.time() - int(ts)) > tolerance:
        return False
    signed = f"{msg_id}.{ts}.".encode() + raw
    expected = base64.b64encode(hmac.new(secret.encode(), signed, hashlib.sha256).digest()).decode()
    return any(
        v == "v1" and hmac.compare_digest(s, expected)
        for v, _, s in (p.partition(",") for p in sigs.split())
    )
```

### SDK Verification

```javascript
const { unwrapWebhook } = require('@whop/sdk/helpers'); // Next.js: import { unwrapWebhook } from '@whop/sdk/helpers'
const event = unwrapWebhook(rawBodyString, { headers, key: process.env.WHOP_WEBHOOK_SECRET });
```

```python
from whop_sdk.lib.verify_webhook import unwrap, WebhookVerificationError
event = unwrap(raw_body_bytes, headers=dict(request.headers), key=os.environ["WHOP_WEBHOOK_SECRET"])
```

Both throw on a bad or missing signature or a timestamp more than 5 minutes off, and return a plain parsed object, not a typed model.

**Why not the SDK helper?** `unwrapWebhook()` (`@whop/sdk/helpers`) and `unwrap()` (`whop_sdk`) check the same signature, but they always enforce a 5-minute timestamp window with no way to turn it off. Hookdeck retries and replays carry the original `webhook-timestamp`, so the SDK rejects them. The examples verify manually and make the window opt-in with `WHOP_TIMESTAMP_TOLERANCE_SECONDS` (default `0`; a positive number of seconds turns it on; anything that isn't a whole number is treated as `0`, with a warning at startup). If you never retry or replay late, the SDK is fine.

## Common Gotchas

- **Do not base64-decode the secret or strip `ws_`.** The generic `standardwebhooks` library base64-decodes its key and throws on `ws_` secrets (`_` is not base64); pass `base64(utf8(secret))` to it, as the Whop SDK does.
- **Raw body only.** `request.text()` in Next.js, `express.raw({ type: '*/*' })` in Express, `await request.body()` in FastAPI.
- **Lowercase header names** in frameworks that normalize them; the SDKs look them up case-insensitively.
- **Legacy formats.** Webhooks using `api_version` `v2`/`v5` are not Standard Webhooks signed.

## Debugging Verification Failures

- Wrong or stale secret (the API shows it only once; copy it from the dashboard Secret column otherwise).
- Body parsed or re-serialized before verification.
- Proxy or middleware changes the body bytes.
- Window turned on and the server clock is off, or a Hookdeck retry or replay arrived after the window (it keeps the original timestamp).
- Test with the dashboard's "send test event" and compare against the delivery log.
