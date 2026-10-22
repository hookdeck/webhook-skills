# Setting Up Emporix Webhooks

## Prerequisites

- An Emporix tenant with access to the Management Dashboard (**Administration > Webhooks**)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 emporix --path /webhooks/emporix` locally)

## Choose a Strategy

1. Go to **Administration > Webhooks**.
2. Pick **Shared account - Svix** (default, up to 5000 events/month per tenant) or **Licensed account - Svix**
   (provide the API key from your own Svix account). Only one strategy is active at a time.
3. Confirm with **Active**.

The **Other - HTTP** strategy is not covered by this skill; it signs differently (`emporix-event-signature`).

## Get Your Signing Secret

Emporix's own pages never display the secret. It lives in Svix:

1. In **Administration > Webhooks**, choose **Open Svix Dashboard** (you're redirected to Svix).
2. Open **Endpoints**, select your endpoint, and copy its **Signing Secret** (starts with `whsec_`; the format is Svix's).
3. Store it as `EMPORIX_WEBHOOK_SECRET`.

Each endpoint has its own secret. Via API, `GET https://api.emporix.io/webhook/{tenant}/dashboard-access`
(bearer token) returns a Svix dashboard login link; the Emporix tenant ID is the Svix application ID.

## Register Your Endpoint

1. In the Svix dashboard go to **Endpoints > Add endpoint**.
2. **Endpoint URL**: your receiver, e.g. `https://example.com/webhooks/emporix?eventType=order.created`.
   The `eventType` query parameter is optional and is this skill's convention for telling event types apart,
   because the payload carries no documented event type. Create one endpoint per event type to use it.
3. Choose the event types you want and **Create**.
4. Back in **Administration > Webhooks**, expand a service, switch the event's **Status** on, then use the
   edit icon to select which attributes appear in the payload and **Update subscription**.

The Svix dashboard shows every delivery, its payload, and the **Event catalog** with each event's schema.

## Recommended Events

`order.created`, `order.updated`, `customer.created`, `product.created`, `product.updated`.

## Testing

Use the endpoint's testing tab in the Svix dashboard to send an example event, or trigger a real action
(create a product or order) in a non-production tenant. The Svix-Shared monthly cap of 5000 events applies to tests too.
