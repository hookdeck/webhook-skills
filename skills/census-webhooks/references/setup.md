# Setting Up Census Webhooks

## Prerequisites

- A Census / Fivetran Activations workspace with permission to manage webhooks
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 census --path /webhooks/census` for local development)

## Get Your Signing Secret

1. In the workspace, open the **Webhooks** tab and click **Add Webhook**.
2. Fill in:
   - **Name** (required)
   - **Description** (optional)
   - **Endpoint** (required): the URL Activations should send payloads to
   - **Events** (required): subscribe to at least one event type
3. Click **Create**. A **one-time secret** is shown. Copy it now; it can't be viewed again. Store it as `CENSUS_WEBHOOK_SECRET`.

Webhooks can also be managed through the API; see the Activations developer docs.

## Register Your Endpoint

Recommended events:

- `sync.success` and `sync.failed` for downstream triggers and alerting
- `sync.completed` if you want one event for both outcomes (check `status`)
- `sync.alert.raised` and `sync.alert.resolved` to mirror sync alerts into your incident tooling
- `sync.triggered` and `sync.started` only if you track run progress

## Testing

The docs don't describe a dedicated test event. Trigger a sync run (or let a sync alert fire) to produce real deliveries, and inspect them with the Hookdeck CLI. Your handler should return 200 for any correctly signed event, including names it doesn't recognise.

## If You Lose the Secret

The secret is shown only at creation. If it's lost, create a new webhook (and delete the old one) to get a new secret.
