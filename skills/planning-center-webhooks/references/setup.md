# Setting Up Planning Center Webhooks

## Prerequisites

- A Planning Center account (any user who can log in can manage subscriptions)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 planning-center --path /webhooks/planning-center` locally)

## Get Your Authenticity Secret

1. Sign in and open https://api.planningcenteronline.com/webhooks.
2. Create a subscription (or open an existing one).
3. Copy its **authenticity secret** (`authenticity_secret`). Store it as `PLANNING_CENTER_AUTHENTICITY_SECRET`.

Use the secret exactly as displayed, as a plain string. It looks like 64 hex characters but is **not** hex-decoded when signing.

## Register Your Endpoint

1. In the Webhooks UI, add a subscription with your endpoint URL.
2. Select the events to receive. The event list is shown in the UI; names look like `people.v2.events.person.updated`.
3. Save. Deliveries are `POST` requests to your URL.

Subscriptions belong to the user who created them, and deliver only data that user can see. Subscriptions created through an OAuth application act on behalf of the authorizing user.

## Testing

- The Webhooks UI shows every request and your server's response, and lets you redeliver a webhook manually.
- Respond `200`. A `410` deactivates the subscription, so don't return it from a test handler.
- To reproduce signing locally, use the worked example in the [docs' Authenticity section](https://api.planningcenteronline.com/docs/overview/webhooks#authenticity); the example tests in this skill do so.
