# Setting Up Spacebring Webhooks

## Prerequisites

- A Spacebring network with the **API & webhooks add-on** (see Spacebring's pricing page)
- Network **owner** access: only the owner can register endpoints
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Spacebring Webhook Endpoint?

1. Create an endpoint in your application that accepts `POST` requests and answers with a `2xx` status.
2. In Spacebring, click the **(...)** menu next to your network name in the left-side panel.
3. Go to **Network settings > Developers > Webhooks**.
4. Add your endpoint URL, e.g. `https://example.com/webhooks/spacebring`, and choose the events to
   receive. A typical start is `booking.created`, `booking.paid`, `membership.created`,
   `shop.order.paid`, and `subscription.purchased`.
5. Acknowledge quickly and process on a queue. Return `200` for events you don't handle.

No challenge or validation request is documented, so the endpoint doesn't need a handshake.

## Where Do I Find the Signing Secret?

The signing secret is on the webhooks management page (the same Network settings > Developers >
Webhooks page). It starts with `whsec_`. Store the full value, prefix included:

```bash
SPACEBRING_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key.

## Testing Locally

```bash
npx hookdeck-cli listen 3000 spacebring --path /webhooks/spacebring
```

Register the tunnel URL as the endpoint, then make a change in your network (for example, create a
booking) to see a delivery arrive. Use port `8000` for the FastAPI example.

## Watching and Replaying Deliveries

Spacebring's docs don't describe a delivery log. Through Hookdeck you can inspect and replay every
request. A replay resends the original `svix-id` and `svix-timestamp`, so deduplicate on `svix-id`
and read [verification.md](verification.md) about the 5-minute window.
