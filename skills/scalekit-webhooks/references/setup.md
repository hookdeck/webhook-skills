# Setting Up Scalekit Webhooks

## Prerequisites

- A Scalekit environment (dashboard access at [scalekit.com](https://scalekit.com))
- A public HTTPS URL for your endpoint (for local development, use the Hookdeck CLI below)

## How Do I Add a Scalekit Webhook Endpoint?

1. Open the Scalekit dashboard and go to **Dashboard > Webhooks**.
2. Add an endpoint with your HTTPS URL, for example `https://your-app.com/webhooks/scalekit`.
3. Subscribe only to the events your app needs (for example `organization.directory.user_created`, `organization.directory.user_updated`, `organization.directory.user_deleted`). Scalekit can send every event, but a narrow subscription means less traffic to process.
4. Save the endpoint. Scalekit documents no challenge or validation request, so nothing needs answering during setup.

## Where Is the Signing Secret?

Each endpoint has its own signing secret, shown in the dashboard under **Webhooks > any endpoint**. It starts with `whsec_`. Put the full value in `SCALEKIT_WEBHOOK_SECRET`; the HMAC key is its base64-decoded part after `whsec_`, which the verifiers do for you.

## What Does Scalekit Expect Back?

- Return a `2xx` within **30 seconds**. Scalekit recommends `201` and processing the event asynchronously.
- Any other status, including `4xx`, is retried with exponential backoff: 8 attempts (immediately, 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, 10 h), about 27 hours 35 minutes in all.
- An endpoint that fails every delivery for 5 days is disabled. Re-enable it from the endpoint's actions menu, then **Resend** failed messages from its message log.
- After a long outage, reconcile directories by listing users and groups instead of replaying every event.

## How Do I Test Locally?

```bash
# Express / Next.js (use 8000 for FastAPI). No install or account required.
npx hookdeck-cli listen 3000 scalekit --path /webhooks/scalekit
```

Register the printed Hookdeck URL as the endpoint URL, then trigger an event (for example create an organization) or resend a message from the message log.

## Which Secret Do I Use?

Each endpoint has its own secret, and each event carries an `environment_id`. Use the secret of the endpoint that receives the deliveries; a different endpoint's secret fails verification.
