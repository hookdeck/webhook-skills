# How to Verify Etsy Webhook Signatures

## Why Signature Verification Matters

Your webhook URL is public. Without verification, anyone can POST a fake `order.paid` and trigger fulfillment. Verifying the signature proves the request came from Etsy, that the body wasn't changed, and (with the timestamp check) that it isn't an old request being replayed.

## How Does Etsy Sign Webhooks?

Etsy follows the [Standard Webhooks](https://www.standardwebhooks.com/) spec.

| Item | Value |
|------|-------|
| Algorithm | HMAC-SHA256, base64-encoded |
| Headers | `webhook-id`, `webhook-timestamp`, `webhook-signature` |
| Signed content | `{webhook-id}.{webhook-timestamp}.{raw body}` |
| Key | Signing secret with `whsec_` removed, then base64-decoded |
| Signature header format | Space-separated `v1,<base64>` entries; any match is valid |
| Timestamp tolerance | Reject if more than 300 seconds from server time (Etsy's recommendation) |

Steps:

1. Build `signed_content = webhook-id + "." + webhook-timestamp + "." + raw_body`.
2. Remove `whsec_` from the secret and base64-decode the rest.
3. Compute HMAC-SHA256 of `signed_content` with that key; base64-encode it.
4. Compare it (timing-safe) against each `v1,` entry in `webhook-signature`. No match → reject.
5. Reject if `abs(now - webhook-timestamp) > 300`.
6. Only then parse the JSON body.

## Implementation

### Node.js: `standardwebhooks` package

Etsy doesn't publish a webhook SDK. The [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package implements the spec, strips `whsec_`, handles multiple signatures, and enforces a 5-minute tolerance:

```javascript
const { Webhook } = require('standardwebhooks');

const wh = new Webhook(process.env.ETSY_WEBHOOK_SECRET);

// rawBody: string or Buffer, exactly as received
const event = wh.verify(rawBody, {
  'webhook-id': req.headers['webhook-id'],
  'webhook-timestamp': req.headers['webhook-timestamp'],
  'webhook-signature': req.headers['webhook-signature'],
});
// Throws WebhookVerificationError on failure; returns the parsed JSON on success
console.log(event.event_type);
```

Error messages thrown by `verify()`:

| Message | Meaning |
|---------|---------|
| `Missing required headers` | One of the three headers is absent |
| `Invalid Signature Headers` | `webhook-timestamp` isn't a number |
| `Message timestamp too old` / `Message timestamp too new` | Outside the 5-minute window |
| `No matching signature found` | Signature mismatch: wrong secret or modified body |

### Python: manual verification

Used by the FastAPI example (no Etsy SDK for Python):

```python
import base64, hashlib, hmac, time

def verify_etsy_webhook(raw_body: bytes, webhook_id: str, timestamp: str,
                        signature_header: str, secret: str) -> bool:
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False
    if abs(int(time.time()) - ts) > 300:
        return False

    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed_content = f"{webhook_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(
        hmac.new(key, signed_content, hashlib.sha256).digest()
    ).decode()

    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(sig, expected):
            return True
    return False
```

(The Python [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package is an alternative.)

## Common Gotchas

- **Use the raw body.** Parsing JSON and re-serializing it changes whitespace and key order, so the HMAC won't match. Use `express.raw()`, `await request.text()` in Next.js, or `await request.body()` in FastAPI.
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not the literal string.
- **Strip the `v1,` prefix** from each signature entry before comparing, and check every entry: the header can contain several during secret rotation.
- **Timestamp is in seconds**, not milliseconds.
- **Header names are lowercase** in Node and are case-insensitive in FastAPI/Next.js; read `webhook-signature`, not `X-Etsy-Signature`.
- **The event type is in the body** (`event_type`), not a header.
- **One secret per endpoint.** If you have several endpoints in the Webhook portal, make sure you use the secret for the one you're receiving on.

## Debugging Verification Failures

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Every request fails | Wrong secret, or secret used without base64 decoding | Copy the secret again from the endpoint details; strip `whsec_` and decode |
| Fails only in production | Body-parsing middleware runs before your handler | Mount the raw-body parser on the webhook route only |
| `Message timestamp too old` | Server clock drift, or replaying an old captured request | Sync the clock (NTP); resend from the portal instead of replaying |
| Test events from the portal fail | A proxy is rewriting the body | Verify on the exact bytes received |

To debug, log the `webhook-id`, `webhook-timestamp`, the body length, and your computed signature next to the header value. Never log the secret.
