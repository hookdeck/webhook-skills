# Setting Up Census Webhooks

## Prerequisites

- A Census / Fivetran Activations account with permission to manage webhooks
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 census --path /webhooks/census` for local development)

## Get Your Signing Secret

1. Create the webhook on a group through the Activations REST API ([create a webhook](https://fivetran.com/docs/activations/rest-api/api-reference/v2/activations-apis/webhooks/create-webhook)), with your endpoint URL and the events to subscribe to.
2. Store the secret from the creation flow server-side as `CENSUS_WEBHOOK_SECRET`. The docs don't say whether it can be viewed again later, so copy it when it's shown.

## Register Your Endpoint

Recommended events:

- `sync.success` and `sync.failed` for downstream triggers and alerting
- `sync.completed` if you want one event for both outcomes (check `status`)
- `sync.alert.raised` and `sync.alert.resolved` to mirror sync alerts into your incident tooling
- `sync.triggered` and `sync.started` only if you track run progress

## Testing

The docs don't describe a dedicated test event. Trigger a sync run with the Sync Trigger API (`POST /syncs/[ID]/trigger`), or let a sync alert fire, to produce real deliveries, and inspect them with the Hookdeck CLI. Your handler should return 200 for any correctly signed event, including names it doesn't recognise.

## If You Lose the Secret

The docs don't describe retrieving or rotating the secret. If it's lost, create a new webhook (and delete the old one) to get a new secret.
