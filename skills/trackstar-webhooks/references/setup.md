# Setting Up Trackstar Webhooks

## Prerequisites

- A Trackstar account with access to the [dashboard](https://dashboard.trackstarhq.com/webhooks)
- A publicly reachable HTTPS endpoint that accepts `POST` with `Content-Type: application/json`
  (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Trackstar Webhook Endpoint?

1. Open the [Webhooks page](https://dashboard.trackstarhq.com/webhooks) in the Trackstar
   dashboard. It is a Svix portal.
2. Add an endpoint with your URL, e.g. `https://example.com/webhooks/trackstar`.
3. Choose the event types to receive. A typical start is `connection.created`,
   `connection.historical-sync-completed`, `connection-error.created`, `order.created` and
   `order.updated`. You can narrow further by connection ID or resource ID in the **Tags** tab.
4. Return a `2xx` quickly and process on a queue. Return `200` for events you don't handle.

Resource events (for example `order.created`, `inventory.updated`) are not sent during a
connection's initial sync, only for changes detected afterwards. Wait for
`connection.historical-sync-completed`, which is sent for each resource type when its initial
sync finishes, or poll `GET /connections/{connection_id}` and check `historical_sync_completed`.
Timing of resource events follows each resource's sync frequency.

## Where Do I Find the Signing Secret?

Open the endpoint in the Webhooks portal and copy its signing secret. Each endpoint has its own
secret. Trackstar's docs don't print the secret format, but Svix endpoint secrets start with
`whsec_`, and the examples expect that. Store the full value, prefix included:

```bash
TRACKSTAR_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the variable is unset or doesn't start with `whsec_`, the examples return `500` instead of
verifying with the wrong key.

## Transformations and Filtering

The portal's **Advanced** tab has a **Transformations** card: JavaScript that runs before
delivery and can change the URL, edit the payload, or cancel the delivery. Trackstar has no
separate test and production webhook environments, so a common use is routing by
`webhook.payload.connection_id` or `integration_name` to different URLs. A transformation that
edits the payload changes what is signed, so verify the body as received, never a rebuilt copy.

## Searching Deliveries

The portal can search past deliveries by event type, connection ID, resource ID and date range.
Filters persist when switching tabs, so clear them when you change views.

## Verification Docs

Trackstar's own page says only that it uses Svix and links to Svix's manual verification guide.
See [verification.md](verification.md) for the full algorithm and a handler for each framework.
