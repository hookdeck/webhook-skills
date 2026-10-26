# Setting Up Fiber AI Webhooks

## Prerequisites

- A Fiber AI account
- An HTTPS endpoint URL (plain HTTP is rejected)

## Get Your Signing Secret

The secret (`whsec_...`) is shown only twice: when you create an endpoint and when you
rotate its secret. Reads never return it, so store it then.

- **API:** `createWebhookEndpoint` returns it as `signingSecret`; `rotateWebhookEndpointSecret` returns a new one.
- **Portal:** open fiber.ai/app/webhooks and enter the portal from there (portal sessions are short-lived links, so don't bookmark the portal URL).

After a rotation the old secret keeps verifying for a short grace period, so you can deploy the new one without dropping deliveries.

## Register Your Endpoint

Dashboard:

1. Go to fiber.ai/app/webhooks and choose **Set up webhooks**.
2. **Add Endpoint** (HTTPS only).
3. Select the event types to receive (at least one) and save. Delivery starts immediately.

API: `createWebhookEndpoint` (also `listWebhookEndpoints`, `getWebhookEndpoint`,
`updateWebhookEndpoint`, `deleteWebhookEndpoint`, `listWebhookEventTypes`). These are free,
rate-limited to 120/min for reads and 60/min for writes. Set `disabled: true` on an
endpoint to pause deliveries without losing its configuration.

Local development: run `npx hookdeck-cli listen 3000 fiber-ai --path /webhooks/fiber-ai`
and use the printed URL as the endpoint.

## Testing

- `sendTestWebhookEvent` delivers a signed example payload of any event type to an endpoint.
- The portal has a "Send Example" button per event type.
- Tracker test signals run through your real webhook with `isDummy: true`.

## Authentication

Requests are authenticated by the Svix signature only (no API key, basic auth or OAuth on
the receiving side). Fiber AI also delivers from a published set of source IPs if you need a firewall allowlist.
