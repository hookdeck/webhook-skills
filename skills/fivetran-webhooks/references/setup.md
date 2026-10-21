# Setting Up Fivetran Webhooks

## Prerequisites

- Fivetran account with an API key and secret ([getting started](https://fivetran.com/docs/rest-api/getting-started))
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 fivetran --path /webhooks/fivetran` for local development)

Fivetran webhooks are created through the REST API, not the dashboard.

## Create the Webhook (and Set the Signing Secret)

Account-level (all groups):

```bash
curl -X POST https://api.fivetran.com/v1/webhooks/account \
  -u "$FIVETRAN_API_KEY:$FIVETRAN_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.example.com/webhooks/fivetran",
    "events": ["sync_start", "sync_end", "connection_failure"],
    "active": true,
    "secret": "your_webhook_secret"
  }'
```

Group-level: `POST /v1/webhooks/group/{groupId}` with the same body.

- `secret` is optional, but **payloads are signed only if you set it**. Always set one. Use the same value as `FIVETRAN_WEBHOOK_SECRET` in your app.
- On create or activation, Fivetran sends **one test POST** to `url`. If the endpoint is unreachable or returns non-2xx, the webhook is not created (HTTP 400). Your endpoint must be running and return 2xx first. Setting `"active": false` skips the check at creation but it still runs when you activate.

## Send a Test Event

```bash
curl -X POST https://api.fivetran.com/v1/webhooks/{webhook_id}/test \
  -u "$FIVETRAN_API_KEY:$FIVETRAN_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event": "sync_end"}'
```

## Recommended Events

`sync_end` (check `data.status`), `connection_failure`, and `transformation_failed` for alerting; `sync_start` for status tracking.

## Reactivating

After 3+ days of non-2xx responses Fivetran deactivates the webhook. Fix the endpoint, then update the webhook with `"active": true` (or create a new one).
