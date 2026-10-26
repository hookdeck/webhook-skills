# Setting Up Streak Webhooks

> **Set a token when you create the webhook through the Streak API. Webhooks without one send
> nothing to verify.**

Webhooks are created through the API; there is no dashboard screen for them.

## Prerequisites

- A Streak account and API key (see [Streak's authentication guide](https://streak.readme.io/docs/authentication))
- The `pipelineKey` (pipeline events) or `teamKey` (team events) you want events from
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 streak --path /webhooks/streak` for local work)

## Create a Webhook With a Token

Create one webhook per event. Pass your own `token`; Streak will send it back as the
`X-Streak-Webhook-Token` header on every request.

```bash
curl -X POST "https://api.streak.com/api/v2/webhooks?pipelineKey=$PIPELINE_KEY" \
  -u "$STREAK_API_KEY:" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "BOX_CREATE",
    "targetUrl": "https://example.com/webhooks/streak?event=BOX_CREATE",
    "token": "'"$STREAK_WEBHOOK_TOKEN"'"
  }'
```

- Use `teamKey=...` instead of `pipelineKey=...` for team events (`CONTACT_*`, `ORG_*`). Specify
  exactly one of them.
- Repeat with a different `event` (and `?event=` value on `targetUrl`) for each event you need.
  The body may not name the event, so the URL is how your handler tells them apart.
- Generate a long random token and store it as `STREAK_WEBHOOK_TOKEN`:
  `openssl rand -hex 32`.

## Configure Your Handler

```bash
STREAK_WEBHOOK_TOKEN=<the token you passed above>
```

Compare the whole `X-Streak-Webhook-Token` value to it in constant time; return `401` on a
missing header or mismatch.

## Managing and Rotating

- List a pipeline's webhooks with Streak's "Get all pipeline-based webhooks" endpoint; see the
  [Streak API reference](https://streak.readme.io/reference/webhooks) for the other webhook endpoints.
- To rotate the token, try the update endpoint first: `POST /webhooks/{webhookKey}` (Update a webhook) lists `token` in its request schema, but its prose says only `event` and `targetUrl` are applied. Send a new
  `token` there, update `STREAK_WEBHOOK_TOKEN`, and confirm the next delivery carries it. If it
  doesn't, create replacement webhooks with the new token, then delete the old ones.
- The same update endpoint can add a token to a webhook that was created without one (subject to
  the same caveat).
- Returning `410 Gone` from your endpoint also deletes the webhook.

## Testing

Streak has no test mode: create a box, edit it or move it to another stage in the pipeline and
watch the request arrive. With the Hookdeck CLI you can inspect and replay each delivery.
