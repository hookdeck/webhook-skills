# Setting Up Lessonly Webhooks

## Prerequisites

- A Lessonly (Seismic Learning) account with API access. If you don't see the API key link in
  settings, Lessonly says you may need to ask for the feature to be activated
  (info@lessonly.com)
- A public HTTPS endpoint for your webhook receiver (use the Hookdeck CLI locally)

## Get Your API Key

1. Sign in to Lessonly and open the company settings page.
2. Click **API & Webhook** and create or copy your API key.
3. API requests use HTTP basic auth: `-u "SUBDOMAIN:API_KEY"`.

## Choose the Authorization Value

The webhook is configured with the API, not a dashboard form. Pick the value Lessonly should
send in the `Authorization` header and keep the **exact string**. Lessonly sends
`lesson_completed_callback_authorization` verbatim as `Authorization: <value>` and adds no
scheme. The docs' example value is `Tm93IGlzIHRo`. If you want a scheme, include it yourself:
`Bearer <token>` or `Basic <base64>` is then part of the value.

Store the whole value as `LESSONLY_AUTHORIZATION`. The parameter is optional in Lessonly, but
without it no `Authorization` header is sent and the receiver in this skill rejects everything,
so always set it.

## Register Your Endpoint

```bash
curl -X PUT https://api.lessonly.com/api/v1/company_settings \
  -H "Content-Type: application/json" \
  -u "SUBDOMAIN:API_KEY" \
  -d '{
    "lesson_completed_callback_url": "https://example.com/webhooks/lessonly",
    "lesson_completed_callback_authorization": "Bearer your-long-random-token"
  }'
```

A successful call returns the stored `lesson_completed_callback_url` and
`lesson_completed_callback_authorization`.

## Hookdeck

Hookdeck's Lessonly source (type `LESSONLY`, labelled "Lessonly") compares the whole
`Authorization` header to its configured key. Paste the Authorization value exactly as set in
Lessonly, including any "Bearer " or "Basic " prefix.

## Local Testing

```bash
npx hookdeck-cli listen 3000 lessonly --path /webhooks/lessonly
```

Set `lesson_completed_callback_url` to the printed URL. For FastAPI, use port `8000`.

## Sending a Manual Test

The body is illustrative (Lessonly doesn't document it):

```bash
curl -X POST http://localhost:3000/webhooks/lessonly \
  -H "Content-Type: application/json" \
  -H "Authorization: $LESSONLY_AUTHORIZATION" \
  -d '{"lesson_id":1234,"user_id":5678,"completed_at":"2026-10-25T12:00:00Z"}'
```

## Rotating the Credential

Call the same `PUT` with a new `lesson_completed_callback_authorization`, then update
`LESSONLY_AUTHORIZATION` (and the Hookdeck source). Do this immediately if the value leaks.
