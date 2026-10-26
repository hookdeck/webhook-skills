# Setting Up GOV.UK Notify Callbacks

## Prerequisites

- A GOV.UK Notify service where you can manage API integration settings
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 govuk-notify --path /webhooks/govuk-notify` locally)
- A bearer token you generate yourself: a long random string

## Choose a Bearer Token

You choose the token; Notify doesn't generate one. Generate something long and random, and store
it as `GOVUK_NOTIFY_WEBHOOK_SECRET` (the bare token, without `Bearer `).

## Register Your Callback

1. In Notify, go to **API integration** and select **Callbacks**.
2. Enter the callback URL (e.g. `https://example.com/webhooks/govuk-notify`).
3. Enter your bearer token. Notify puts it in the `Authorization` header of each request.
4. Save. Notify posts delivery receipts, received text messages and returned letters to the
   callback URL(s) configured on that page. A returned-letter callback can arrive weeks after
   the letter was sent.

## Hookdeck

Hookdeck's source type is **GOV.UK Notify**. Paste the bearer token you set for the callback in GOV.UK Notify (API integration > Callbacks).

## Test

Delivery receipts work with test API keys. Replay by hand with curl:

```bash
curl -X POST http://localhost:3000/webhooks/govuk-notify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GOVUK_NOTIFY_WEBHOOK_SECRET" \
  -d '{"id":"740e5834-3a29-46b4-9a6f-16142fde533a","reference":"12345678","to":"hello@gov.uk","status":"delivered","created_at":"2017-05-14T12:15:30.000000Z","completed_at":"2017-05-14T12:15:30.000000Z","sent_at":"2017-05-14T12:15:30.000000Z","notification_type":"email","template_id":"1d8b2b3c-0f4c-4a3e-9b53-7c5f2a1e8d10","template_version":1}'
```

## Retries

If your endpoint fails, Notify retries every 5 minutes, up to 5 times. Return `200` once handled
and process duplicates idempotently.
