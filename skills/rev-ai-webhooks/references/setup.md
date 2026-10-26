# Setting Up Rev AI Webhooks

## Prerequisites

- A Rev AI account and an access token (Rev AI dashboard → Access Token)
- A public HTTPS endpoint for your webhook receiver (use the Hookdeck CLI locally)

## There Is No Dashboard Webhook Setting

Rev AI webhooks are configured **per job**, in the submission request. Nothing is registered
in the dashboard.

## Choose the Credential

Pick a long random value and store it as `REV_AI_AUTHORIZATION`, including a scheme:

```bash
REV_AI_AUTHORIZATION="Bearer $(openssl rand -hex 32)"
```

Rev AI requires `Authorization` to be the only header, with a value of the form
`<scheme> <token>` (at most 1000 characters for the `auth_headers` object).

## Submit a Job with notification_config

```bash
curl -X POST https://api.rev.ai/speechtotext/v1/jobs \
  -H "Authorization: Bearer $REV_AI_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"source_config\": { \"url\": \"https://www.rev.ai/FTC_Sample_1.mp3\" },
    \"notification_config\": {
      \"url\": \"https://example.com/webhooks/rev-ai\",
      \"auth_headers\": { \"Authorization\": \"$REV_AI_AUTHORIZATION\" }
    },
    \"metadata\": \"order-1234\"
  }"
```

(`media_url` is the older alternative to `source_config`; the API reference shows both.)

- Rev AI sends `Authorization: <the value you set>` on the callback POST.
- The deprecated `callback_url` field has no auth headers, is visible in the job response, and
  cannot be combined with `notification_config`. Use `notification_config`.
- `auth_headers` is optional but you should always set it, otherwise anyone who learns the URL
  can post fake results.
- `notification_config` is not shown in the submission response.

## Local Testing

```bash
npx hookdeck-cli listen 3000 rev-ai --path /webhooks/rev-ai
```

Use the printed URL as `notification_config.url`. For FastAPI, use port `8000`.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/rev-ai \
  -H "Content-Type: application/json" \
  -H "Authorization: $REV_AI_AUTHORIZATION" \
  -d '{"job":{"id":"Umx5c6F7pH7r","status":"transcribed","created_on":"2018-05-05T23:23:22.29Z","duration_seconds":356.24}}'
```

## Rotating the Credential

The credential lives on each job, so rotate by submitting new jobs with the new value. Jobs
already in flight keep the old value, so accept both during the changeover.
