# Setting Up Nash Webhooks

## Prerequisites

- A Nash account with Portal access (use the sandbox Portal while developing)
- A public HTTPS endpoint (for local development, see the Hookdeck CLI below)

## How Do I Register a Webhook Endpoint?

1. Open the Nash Portal: **Settings > [Webhook Management](https://portal.usenash.com/settings/webhook-management)**.
2. Add an endpoint with your URL, for example `https://your-app.example.com/webhooks/nash`.
3. Filter the event types it receives. You can register several endpoints and route
   different events to different services. The **Event Catalog** tab lists every event
   schema with example payloads.

## Where Is the Signing Secret?

**Settings > Webhook Management > click the endpoint > Signing Secret.** It starts with
`whsec_`. Each endpoint has its own secret; store it as `NASH_WEBHOOK_SECRET`.

Sandbox and production are separate environments with separate Portals, so they have
separate endpoints and secrets.

## How Do I Test Locally?

```bash
npx hookdeck-cli listen 3000 nash --path /webhooks/nash   # Express / Next.js
npx hookdeck-cli listen 8000 nash --path /webhooks/nash   # FastAPI
```

No account required. Register the printed URL as an endpoint in the sandbox Portal, then
create and dispatch a sandbox job; sandbox pairs test orders with simulated fleets, so
you receive `delivery` and `task` events without sending a real courier.

## Firewall / IP Allowlisting

Webhooks come from Svix's IP addresses, listed in
[Svix's source IPs documentation](https://docs.svix.com/receiving/source-ips). Allowlisting
is optional; signature verification is what authenticates the request.

## Retries and Replays

Failed deliveries (network errors, 5xx, and certain 4xx such as 408, 409 and 429) are
retried on this schedule: immediately, then after 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours and 10 hours. After
all eight fail, the message is marked failed. Replay single messages, or **Recover** all
failed messages since a date, from Webhook Management > endpoint > Attempts.

Response controls:

- `webhook-delivery: abort-message` response header stops retries for that message.
- `webhook-delivery: disable` response header disables the endpoint.
- HTTP `410 Gone` also disables the endpoint.
