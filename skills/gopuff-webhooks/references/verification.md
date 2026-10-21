# Gopuff Signature Verification

## How Does Gopuff Webhook Verification Work?

Gopuff's pages have no signature section. Because endpoints are registered in the Svix App Portal, deliveries use [Svix's scheme](https://docs.svix.com/receiving/verifying-payloads/how-manual):

- Headers: `svix-id`, `svix-timestamp` (seconds since epoch), `svix-signature` (space-delimited `v1,<base64>` list). White-labeled accounts may get `webhook-id` / `webhook-timestamp` / `webhook-signature`.
- Signed content: `{svix-id}.{svix-timestamp}.{raw body}`
- Algorithm: HMAC-SHA256, key = base64-decoded portion of the secret after `whsec_`, output base64.
- Compare in constant time against each `v1` entry; remove the `v1,` prefix first.
- Compare `svix-timestamp` with your clock (5 minutes is typical).

## Implementation

### SDK Verification (preferred)

```javascript
import { Webhook } from 'svix';
new Webhook(process.env.GOPUFF_WEBHOOK_SECRET).verify(rawBody, {
  'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature,
}); // throws on failure
```

```python
from svix.webhooks import Webhook, WebhookVerificationError
Webhook(secret).verify(raw_body, {"svix-id": ..., "svix-timestamp": ..., "svix-signature": ...})
```

### Manual Verification

See the snippet in [SKILL.md](../SKILL.md). Python equivalent:

```python
key = base64.b64decode(secret.split("_", 1)[1])
expected = hmac.new(key, f"{id}.{ts}.".encode() + raw_body, hashlib.sha256).digest()
```

## Common Gotchas

- Use the raw body; parsing and re-serializing JSON changes the bytes.
- Decode the secret from base64 after `whsec_`; don't use the string as the key.
- The header can hold several signatures (secret rotation); accept any valid `v1`.
- Old `svix-timestamp` fails verification, including on manual replays from the portal if you reuse a stale captured request.
- The same `svix-id` is reused on retries; use it for idempotency.

## Debugging Verification Failures

- Missing headers: a proxy or framework stripped them, or the request didn't come from Svix.
- Invalid signature: wrong endpoint's secret, body modified by middleware, secret not base64-decoded.
- Timestamp error: server clock drift, or a replayed old request.
