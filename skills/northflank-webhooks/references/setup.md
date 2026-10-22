# Setting Up Northflank Webhook Notifications

## Prerequisites

- A Northflank account or team with permission to create notification integrations
- A public HTTPS URL for your endpoint. During development, tunnel to localhost:

```bash
npx hookdeck-cli listen 3000 northflank --path /webhooks/northflank
```

(Use port `8000` for the FastAPI example.)

## Get a Secret

The secret is optional in Northflank, but set one so your endpoint can reject requests that
didn't come from your integration. Generate it yourself:

```bash
openssl rand -hex 32
```

or use the random secret generator in the integration form. Put it in your app's environment as
`NORTHFLANK_WEBHOOK_SECRET`. On Northflank, add it as a runtime variable or secret file.

## Register Your Endpoint

1. Open the notifications page: account or team settings → Observability → Notifications
   (for organisations, open Observability → Notifications in the organisation).
2. Create a new integration and choose the **Webhook** type.
3. Enter your webhook URL, e.g. `https://your-app.example.com/webhooks/northflank`.
4. Paste the secret into the **Secret** field.
5. Select the events to receive. Recommended: `build:success`, `build:failure`,
   `service:deployment:status-update`, `job-run:failure`, `addon-backup:success`,
   `addon-backup:failure`, `billing:invoice-payment-failed`.
6. Optionally restrict the integration to specific projects (not available for organisation
   integrations).
7. Save. You can edit the URL, secret and events later.

## Test

Trigger a matching event (for example start a build), then open the integration to see the
recent requests, their headers and body, and your response status. A `401` means the secret in
Northflank doesn't match `NORTHFLANK_WEBHOOK_SECRET`. You can resend any request from its event
page.

## Test Mode vs Live Mode

Northflank has no separate test mode for notification integrations; use a non-production project
and resend events from the integration page.
