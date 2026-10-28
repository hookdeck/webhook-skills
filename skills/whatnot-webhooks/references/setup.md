# Setting Up Whatnot Webhooks

Source: [Webhooks guide](https://developers.whatnot.com/getting-started/webhooks).

## Prerequisites

- A **client app** in the Whatnot developer dashboard.
- A publicly reachable HTTPS endpoint. For local development, use the Hookdeck
  CLI (below).
- The scopes for the topics you want (see below), held by **both** your app
  and each seller's installation of it.

## Subscribing to Topics

Subscriptions are per client app and managed in the **developer dashboard**:

1. Open your client app.
2. Register the URL that will receive the POST requests.
3. Choose the topics to subscribe to, e.g. `orders.created`.

There's no REST endpoint for creating or changing subscriptions; use the
dashboard.

## Scopes

Each topic needs a scope. Your app must request it, and the seller's
installation must have granted it. If either is missing, that seller's events
for the topic aren't delivered.

| Topics | Scope |
|---|---|
| `orders.created`, `orders.updated` | `read:orders` |
| `shows.created`, `shows.updated`, `shows.started`, `shows.ended`, `shows.cancelled` | `read:shows` |
| `merchandising.products.added_to_show`, `merchandising.products.removed_from_show` | `read:merchandising` |
| `shipments.created`, `shipments.label_generated`, `shipments.tracking_code_added`, `shipments.parcel_updated`, `shipments.items.added`, `shipments.items.removed` | `read:shipments` |
| `products.created`, `products.updated`, `products.deleted` | `read:inventory` |

Add **`read:customers`** to receive `buyer` on orders, and `recipient` and
`documents` on shipments. Destination addresses and shipping documents also
need customer-address access: private apps have it, and public apps get it
once Whatnot approves them. Without these the fields are `null`.

## Getting the Webhook Secret

Copy the webhook secret from your client app in the developer dashboard. It
looks like this:

```
wn_wh_AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=
```

Store it as-is:

```bash
WHATNOT_WEBHOOK_SECRET=wn_wh_your_base64_secret
```

To use it, strip the `wn_wh_` prefix and base64-decode the rest; the decoded
bytes are the HMAC key. The examples do both. If you pass the secret to a
Standard Webhooks library, strip `wn_wh_` first, because the library only
recognises its own `whsec_` prefix. See [verification.md](verification.md).

## Local Development

```bash
npx hookdeck-cli listen 3000 whatnot --path /webhooks/whatnot
```

The CLI prints a public HTTPS URL that forwards to
`http://localhost:3000/webhooks/whatnot`. Register that URL in the dashboard.
No Hookdeck account is required; the CLI creates a guest account on first run
and gives you a web UI showing each request's raw body and headers.

## Using Hookdeck in Front of Your Endpoint

Hookdeck's `WHATNOT` source type was built for the legacy
`X-Whatnot-Webhook-Signature` hex scheme. Check that it supports Standard
Webhooks before enabling its signature verification; otherwise leave source
verification off and verify in your handler, as the examples do.

When you verify in your handler, remember that Hookdeck retries and replays
resend Whatnot's original `webhook-timestamp`. They pass the 5-minute check
only within 5 minutes of the original attempt.

## Delivery Health

Whatnot rate-limits an endpoint that keeps failing, emails a warning and
eventually unsubscribes it. If that happens, fix the endpoint and re-subscribe
from the dashboard. Events from the gap aren't redelivered once their 11
attempts are used up, so reconcile through the API.

## Checklist

- [ ] Webhook route reads the **raw** body (no JSON body parser ahead of it)
- [ ] `WHATNOT_WEBHOOK_SECRET` set; handler strips `wn_wh_` and fails closed without it
- [ ] Timestamp tolerance (5 minutes) enforced
- [ ] Handler returns a **2xx** within 5 seconds for every verified event, including unknown types
- [ ] Events deduped on the `webhook-id` header
- [ ] Handlers don't assume ordering (`orders.updated` can precede `orders.created`)
- [ ] Customer-data fields null-checked
- [ ] Money `amount` kept as a string or decimal
