# Setting Up Live Tennis API Webhooks

## Prerequisites

- A Live Tennis API **direct** key on the **ULTRA** plan (marketplace keys can't create webhooks)
- A public HTTPS endpoint (use `npx hookdeck-cli listen` during development)

Webhooks are managed through the API; there is no dashboard step.

## How Do I Register a Webhook and Get the Secret?

```bash
curl -X POST https://api.livetennisapi.com/api/public/v1/webhooks \
  -H "X-API-Key: $LIVE_TENNIS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/webhooks/live-tennis-api","events":["score","break_point"]}'
```

- `url` must be HTTPS and publicly routable.
- `events` is optional and defaults to `["score"]`. Allowed values include `score`, `break_point` (delivers `break_point` and `break_point_result`) and `point`.
- The 201 response includes `secret`. **It is shown exactly once**: store it as `LIVE_TENNIS_API_WEBHOOK_SECRET` right away. `GET /webhooks` never returns it.
- A fourth webhook on the same key returns `409 webhook_limit`.

Other endpoints: `GET /webhooks` (list, shows `enabled`, `consecutive_failures`, `last_error`) and `DELETE /webhooks/{webhookId}`.

## What If My Webhook Stops Delivering?

After 25 consecutive failed deliveries it is disabled automatically. Check `GET /webhooks` for `enabled: false` and `last_error`, fix the endpoint, then delete the webhook and register it again (you get a new secret).

## How Do I Test a Webhook?

Register a webhook for the `score` event while matches are live and watch deliveries arrive. Locally:

```bash
npx hookdeck-cli listen 3000 live-tennis-api --path /webhooks/live-tennis-api
```

Register the printed Hookdeck URL as the webhook `url`. Delivery is at-most-once with a ~3s timeout and redirects disabled, so the endpoint must answer 2xx directly.
