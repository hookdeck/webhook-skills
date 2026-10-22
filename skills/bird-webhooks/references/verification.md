# How to Verify Bird Webhook Signatures

Bird follows the [Standard Webhooks](https://www.standardwebhooks.com) signing scheme. This is the current bird.com API. The legacy MessageBird API (`MessageBird-Signature` / `MessageBird-Signature-JWT`) is a different scheme and isn't covered.

## How Does Bird Sign Webhooks?

Every delivery carries three headers:

| Header | Value |
|--------|-------|
| `webhook-id` | Identifies the delivery. Retries and replays reuse it. |
| `webhook-timestamp` | Unix seconds of this delivery attempt |
| `webhook-signature` | `v1,<base64 HMAC-SHA256>`, possibly several signatures space-delimited |

- **Signed content:** `{webhook-id}.{webhook-timestamp}.{raw request body}`
- **Algorithm:** HMAC-SHA256, base64-encoded
- **Key:** the endpoint secret with the `whsec_` prefix stripped, then **base64-decoded** to bytes
- **Timestamp:** reject deliveries more than 5 minutes old
- **Dedupe:** on `webhook-id`

## Implementation

### Library Verification (recommended)

`standardwebhooks` (npm and PyPI) checks the timestamp, handles several signatures and compares in constant time.

```javascript
const { Webhook } = require('standardwebhooks');

const event = new Webhook(process.env.BIRD_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.headers['webhook-id'],
  'webhook-timestamp': req.headers['webhook-timestamp'],
  'webhook-signature': req.headers['webhook-signature'],
}); // throws on failure; returns the parsed JSON
```

```python
from standardwebhooks.webhooks import Webhook

event = Webhook(secret).verify(raw_body, {
    "webhook-id": request.headers["webhook-id"],
    "webhook-timestamp": request.headers["webhook-timestamp"],
    "webhook-signature": request.headers["webhook-signature"],
})  # raises WebhookVerificationError on failure
```

Bird also ships SDKs (TypeScript, Python, Go, PHP) with a `webhooks.unwrap(rawBody, headers)` call that does the same checks. Any Standard Webhooks reference library works too.

### Manual Verification (no dependency)

```javascript
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody, headers, secret) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  if (!id || !timestamp || !headers['webhook-signature']) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false; // 5-minute tolerance
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  // During secret rotation the header holds several entries. Accept any match.
  return headers['webhook-signature'].split(' ').some((part) => {
    const sig = Buffer.from(part.replace(/^v1,/, ''), 'base64');
    return sig.length === expected.length && timingSafeEqual(sig, expected);
  });
}
```

```python
import base64, hashlib, hmac, time

def verify(raw_body: bytes, headers: dict, secret: str) -> bool:
    msg_id, ts, sigs = headers.get("webhook-id"), headers.get("webhook-timestamp"), headers.get("webhook-signature")
    if not (msg_id and ts and sigs) or abs(time.time() - int(ts)) > 300:
        return False
    key = base64.b64decode(secret[len("whsec_"):])
    signed = f"{msg_id}.{ts}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    return any(hmac.compare_digest(p.split(",", 1)[-1], expected) for p in sigs.split(" "))
```

## Common Gotchas

- **Raw body:** compute the HMAC over the exact bytes received. Parsing and re-serialising the JSON changes whitespace or key order and breaks the signature. In Express use `express.raw({ type: '*/*' })`, in Next.js `await request.text()`, in FastAPI `await request.body()`.
- **Decode the key:** the HMAC key is the base64-decoded secret *after* `whsec_`. Using the secret string itself is the most common failure.
- **Several signatures:** during the 24h rotation overlap the header holds two `v1,` entries. Accept a match against any.
- **Timestamp changes per attempt:** `webhook-timestamp` is the current attempt, not the event time. A retry has a fresh timestamp, so a 5-minute check doesn't reject retries. The event time is the `timestamp` inside the body.
- **Secret per endpoint:** each endpoint has its own `whsec_` secret, shown only at creation.
- **Return 400 on failure:** Bird retries all failures, so rejecting a delivery you couldn't verify (for example a secret that isn't deployed yet) doesn't lose the event. Return `2xx` only when you mean to discard it.

## How to Debug Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always fails | HMAC keyed with the undecoded secret, or the `whsec_` prefix left in the key |
| Fails on some requests only | Body re-serialised by a JSON parser, or a different endpoint's secret |
| Fails right after rotation | New secret not deployed; the old one stops signing after 24 hours |
| Timestamp error | Server clock skew over 5 minutes |
| Missing header error | A proxy renamed or dropped `webhook-*` headers |

Send a signed test event with `POST /v1/webhooks/{webhook_id}/test` and log the received headers and raw body length.
