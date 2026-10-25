# Setting Up JobAdder Webhooks

## Prerequisites

- A JobAdder partner application (OAuth 2.0 client) that can request the `offline_access` scope
  plus the read scopes for the events you want
- A public HTTPS endpoint for your webhook receiver (use the Hookdeck CLI locally)

JobAdder has no dashboard for webhooks. You create them with the Webhook API.

## Choose Your Authorization Value

The webhook's optional `authorization` field is "Optional authorization header to include with the
HTTP POST notification" (example: `Basic dXNlcm5hbWU6cGFzc3dvcmQ=`). JobAdder sends that string back
as the `Authorization` header on every notification. Pick a long random value, with or without a
scheme prefix, for example `Bearer <random-token>`.

Store the value **exactly as you set it in the JobAdder webhook, including any "Bearer " or "Basic "
prefix** as `JOBADDER_AUTHORIZATION`. Don't strip, parse or base64-decode it.

If you use Hookdeck's JobAdder source (`JOBADDER`), its setup note says the same thing: "Paste the
authorization value exactly as set in the JobAdder webhook, including any "Bearer " or "Basic "
prefix."

## Create the Webhook

1. Get an access token with the `offline_access` scope and the relevant read scopes.
2. Call `POST https://api.jobadder.com/v2/webhooks`:

```bash
curl -X POST https://api.jobadder.com/v2/webhooks \
  -H "Authorization: Bearer $JOBADDER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My webhook",
    "events": ["candidate_status_changed", "jobapplication_status_changed", "placement_approved"],
    "url": "https://example.com/webhooks/jobadder",
    "authorization": "Bearer replace-with-a-long-random-token",
    "status": "Enabled"
  }'
```

`name`, `events` and `url` are required. `status` is `Enabled`, `Disabled` or `Suspended`.
Update with `PUT /webhooks/{webhookId}`; list with `GET /webhooks`; remove with
`DELETE /webhooks/{webhookId}`. A webhook's status can also become `Failed`.

3. Set `JOBADDER_AUTHORIZATION` to the same `authorization` string you sent.

## Local Testing

```bash
npx hookdeck-cli listen 3000 jobadder --path /webhooks/jobadder
```

Use the printed URL as the webhook `url`. For FastAPI, use port `8000`.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/jobadder \
  -H "Content-Type: application/json" \
  -H "Authorization: $JOBADDER_AUTHORIZATION" \
  -d '{"apiVersion":2,"event":"placement_approved","eventId":"00000000-0000-0000-0000-000000000000","eventDate":"2019-01-01T09:00:00Z","eventUser":{},"eventData":{}}'
```
