# Setting Up Appstle Webhooks

## Prerequisites

- An Appstle Subscriptions store on a plan with webhooks (Enterprise or Enterprise Plus, or ask support@appstle.com)
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register an Appstle Webhook Endpoint?

1. In the Appstle dashboard, go to **More → Webhook Integration** and click **Enable Webhook**.
2. Click **Launch webhook portal**.
3. Add your webhook endpoint URL, e.g. `https://example.com/webhooks/appstle`.
4. Select the events you want to receive (for example `subscription.created`,
   `subscription.cancelled`, `subscription.billing-failure`).

## Where Do I Find the Signing Secret?

Open the endpoint in the webhook portal and copy its signing secret. It starts with
`whsec_`. Store it as `APPSTLE_WEBHOOK_SECRET`:

```bash
APPSTLE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

Each endpoint has its own secret. If you register several endpoints, each one needs the
matching secret.

## How Do I Test Locally?

Start a tunnel with the Hookdeck CLI (no account required):

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 appstle --path /webhooks/appstle

# FastAPI
npx hookdeck-cli listen 8000 appstle --path /webhooks/appstle
```

Use the printed URL as the endpoint URL in Appstle.

## How Do I Send a Test Event?

1. Go to **More → Webhook Integration** in your Appstle dashboard and click **Launch webhook portal**.
2. Open your endpoint and send it an example event.
3. Check that your endpoint receives and verifies it.

## Endpoint Requirements

- Return a `2xx` status quickly (for example `200 OK`) and process the event in a
  background job. Slow responses time out and trigger retries.
- Return `2xx` for every successful receipt, even if your business logic reports an error.
- Exempt the webhook route from CSRF protection.
- Keep the **raw** request body for signature verification.
- Deduplicate on `svix-id`: events may be delivered more than once.

## How Do I Recover Missed Events?

In the webhook portal you can see every delivery attempt and retry
failed deliveries manually. For help, email support@appstle.com with your endpoint URL
and the `svix-id` of the failing message.
