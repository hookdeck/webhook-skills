# Setting Up YouMail Webhooks

## Prerequisites

- A YouMail Protective Services API account with API access
- A public https endpoint for your receiver (use the Hookdeck CLI locally)

## Auth Scheme for Hookdeck

Choose the Bearer auth scheme on the YouMail webhook, not Basic, and paste the whole Authorization value, including "Bearer ".

YouMail supports three auth options on a webhook: none, `Basic` (username and password) and
`Bearer` (token). Hookdeck's YouMail source and these examples cover **Bearer** only. Basic is
not covered by Hookdeck's YouMail source.

With `Bearer`, YouMail sends `Authorization: Bearer <token>`. Store the whole value, prefix
included, as `YOUMAIL_AUTHORIZATION` (for example `Bearer 1b2c3d4e-...`).

## Create a Webhook

YouMail webhooks are created through the API (`POST /api/v3/notifications/webhooks`). The
request body is a `WebhookSettings` object with `eventParams` key/value pairs:

```bash
curl -X POST https://data.youmail.com/api/v3/notifications/webhooks \
  -H "Content-Type: application/json" \
  -H "<your YouMail API auth headers>" \
  -d '{
    "activeFlag": true,
    "eventType": "CALL_EVENT",
    "eventParams": [
      {"key": "url", "value": "https://example.com/webhooks/youmail/call-events"},
      {"key": "auth", "value": "Bearer"},
      {"key": "token", "value": "<your-token>"}
    ]
  }'
```

Use your YouMail API credentials as described in the API docs. For `WATCHLIST_SCORE_THRESHOLD`
add `watchlistUuid` and `threshold` params. `WATCHLIST_PHONE_SCORE_THRESHOLD` is deprecated
and rejected for new webhooks.

Create one webhook per `eventType`, each with its own URL (for example
`/webhooks/youmail/call-events`), or point several at one URL and detect by payload shape.

## Local Testing

```bash
npx hookdeck-cli listen 3000 youmail --path /webhooks/youmail
```

Use the printed URL as the webhook `url`. For FastAPI, use port `8000`.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/youmail \
  -H "Content-Type: application/json" \
  -H "Authorization: $YOUMAIL_AUTHORIZATION" \
  -d '{"tnReportUuid":"f0e1d2","phoneNumber":"+15555550100","status":"MITIGATED"}'
```
