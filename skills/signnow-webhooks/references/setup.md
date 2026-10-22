# Setting Up SignNow Webhooks

## Prerequisites

- A SignNow account with API access (API trial, API subscription or Site License).
  A Business or Enterprise plan alone does not include API access.
- A public HTTPS endpoint (for local development, run
  `npx hookdeck-cli listen 3000 signnow --path /webhooks/signnow`)

## Choose Your Secret Key

SignNow does not issue the secret: you choose it. Use a long random string (up
to 300 characters), e.g. `openssl rand -hex 32`, or click **Generate New Key**
in the API Dashboard. Save it as `SIGNNOW_WEBHOOK_SECRET`. **If you skip it,
callbacks are unsigned and verification will fail.**

## Register Your Endpoint

### Via API

```bash
curl --request POST https://api.signnow.com/v2/event-subscriptions \
  --header 'Authorization: Bearer {access_token}' \
  --header 'Content-Type: application/json' \
  --data '{
    "event": "document.complete",
    "entity_id": "{document_or_user_or_group_id}",
    "attributes": {
      "callback": "https://example.com/webhooks/signnow",
      "secret_key": "YOUR_SECRET_KEY"
    }
  }'
```

`entity_id` is the id of the document, user or document group the event
applies to. Optional attributes include `retry_count`, `delay` (up to 100
seconds), `include_metadata`, `headers` and `docid_queryparam`.

### Via API Dashboard

1. Open **API Dashboard → Webhooks** and create a webhook.
2. Enter your callback URL, pick the entity type and event.
3. Enter your own secret key or click **Generate New Key**, and save it.

`GET /v2/event-subscriptions` shows the configured `secret_key` if you lose it.

## Test and Debug

Complete or open a test document. **API Dashboard → Webhooks → Events History**
shows every attempt with its response code, and
`GET /v2/event-subscriptions/{id}/callbacks` returns the same via API.
