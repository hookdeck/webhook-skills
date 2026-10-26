# Setting Up YouMail Webhooks

## Prerequisites

- A YouMail Protective Services API account with API access
- A public https endpoint for your receiver (use the Hookdeck CLI locally)

## Auth Scheme for Hookdeck

Choose the Bearer auth scheme on the YouMail webhook, not Basic, and paste the whole Authorization value, including "Bearer ".

YouMail supports three auth options on a webhook: none, `Basic` (username and password) and
`Bearer` (token). Hookdeck's YouMail source and these examples cover **Bearer** only. Basic is
not covered by Hookdeck's YouMail source.

YouMail's docs don't print the header the `Bearer` scheme produces; the expected form is
`Authorization: Bearer <token>`. Store the whole value, prefix included, as
`YOUMAIL_AUTHORIZATION` (for example `Bearer 1b2c3d4e-...`). If deliveries are rejected,
capture one and set `YOUMAIL_AUTHORIZATION` to the `Authorization` value exactly as received.

## Create a Webhook

YouMail webhooks are created through the API (`POST /api/v3/notifications/webhooks`). The
request body is a `WebhookSettings` object with `eventParams` key/value pairs:

```bash
curl -X POST https://dataapi.youmail.com/api/v3/notifications/webhooks \
  -H "Content-Type: application/json" \
  -H "User-Agent: my-app/1.0" \
  -H "DataApiSid: $YOUMAIL_API_SID" \
  -H "DataApiKey: $YOUMAIL_API_KEY" \
  -d '{
    "activeFlag": true,
    "eventType": "CALL_EVENT",
    "eventParams": [
      {"key": "url", "value": "https://example.com/webhooks/youmail/call-events"},
      {"key": "method", "value": "POST"},
      {"key": "auth", "value": "Bearer"},
      {"key": "token", "value": "<your-token>"}
    ]
  }'
```

The API root is `https://dataapi.youmail.com/api/*`. Every request needs a `User-Agent` header
and your `DataApiSid` and `DataApiKey` headers (from the dashboard settings page; add
`DataApiOrgSid` if you collaborate with several Organizations). `method` is a required param
but "will default to POST and cannot be modified". For `WATCHLIST_SCORE_THRESHOLD`
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
