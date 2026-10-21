---
name: gopuff-webhooks
description: >
  Receive and verify Gopuff (Powered by Gopuff partner API) webhooks. Use when
  setting up a Gopuff webhook handler, debugging svix-id / svix-timestamp /
  svix-signature verification, or handling order.status, order.status.v2 and
  order.delivered events, delivery status (driver location) and delivery ETA updates.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Gopuff Webhooks

Gopuff's partner API (Powered by Gopuff) sends webhooks about order fulfillment: order status changes, driver location and delivery ETA. Endpoints are registered in the **Svix App Portal**, which signs every delivery. Gopuff's own pages have no signature section; the scheme comes from [Svix's manual verification guide](https://docs.svix.com/receiving/verifying-payloads/how-manual).

## When to Use This Skill

- How do I receive Gopuff webhooks?
- How do I verify Gopuff webhook signatures (`svix-signature`)?
- How do I handle `order.status.v2` or `order.delivered` events?
- How do I get the Svix App Portal link for my Gopuff partner account?
- Why is my Gopuff webhook signature verification failing?

## Verification (core)

Each request carries `svix-id`, `svix-timestamp` (Unix seconds) and `svix-signature` (space-delimited `v1,<base64>` entries). The signed content is `{svix-id}.{svix-timestamp}.{raw body}`, HMAC-SHA256 with the base64-decoded part of the `whsec_` secret, base64-encoded. Use the raw body, never re-serialized JSON.

```javascript
import crypto from 'node:crypto';

function verify(rawBody, { id, timestamp, signature }, secret) {
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false; // 5 min tolerance
  const key = Buffer.from(secret.split('_')[1], 'base64'); // decode after "whsec_"
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`).digest();
  return signature.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    const got = Buffer.from(sig ?? '', 'base64');
    return version === 'v1' && got.length === expected.length &&
      crypto.timingSafeEqual(got, expected);
  });
}
```

The examples use the official `svix` SDK (`new Webhook(secret).verify(rawBody, headers)`), which does the same and also accepts the white-labeled `webhook-*` headers.

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Common Event Types

Event types you select in the Svix App Portal (from Gopuff's [webhook docs](https://devportaldocs.poweredbygopuff.com/#/webhooks/introduction)):

| Event Type | Description |
|------------|-------------|
| `order.status.v2` | Order status changed (recommended; slim payload) |
| `order.status` | Order status changed (full order object; end of support 08/15/2025) |
| `order.delivered` | Order successfully delivered |

Order statuses: `Pending` (no event sent), `Packing_Now`, `Packed`, `Delivery`, `Finished`, `Cancelled`. Gopuff also documents Delivery Status (driver location) and Delivery ETA payloads but does not list event-type strings for them.

**The payloads contain no event-type field**, and Svix sends no event-type header. The examples tell payloads apart by shape (`order`, `driver`, `expected_delivery_time`). Always keep a default branch for unknown shapes.

## Environment Variables

```bash
GOPUFF_WEBHOOK_SECRET=whsec_xxxxx   # Svix App Portal > Endpoints > Signing Secret
```

## Local Development

```bash
npx hookdeck-cli listen 3000 gopuff --path /webhooks/gopuff
```

No account required. Use the printed URL as the endpoint URL in the App Portal. (FastAPI example: port 8000.)

## Reference Materials

- [references/overview.md](references/overview.md) - Events, payloads, order status flow
- [references/setup.md](references/setup.md) - App Portal link, endpoint, secret
- [references/verification.md](references/verification.md) - Signature details and debugging

## Recommended: webhook-handler-patterns

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [svix-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/svix-webhooks) - The Svix signing scheme in general
- [guesty-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/guesty-webhooks) - Another Svix-delivered provider
- [clerk-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/clerk-webhooks) - Svix-signed auth events
- [nash-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/nash-webhooks) - Delivery and logistics webhooks
- [aftership-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/aftership-webhooks) - Shipment tracking webhooks
- [shopify-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/shopify-webhooks) - Commerce order webhooks
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
