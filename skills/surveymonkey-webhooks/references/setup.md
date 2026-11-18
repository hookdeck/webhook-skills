# Setting Up SurveyMonkey Webhooks

## Prerequisites

- A SurveyMonkey app (client ID, client secret, access token) with the Create/Modify Webhooks scope
- A public HTTPS endpoint that answers `HEAD` with `200` (use the Hookdeck CLI locally)

## 1. Make the URL Answer HEAD

Creating, replacing or modifying a webhook makes SurveyMonkey send a `HEAD` request to the subscription URL: "Url must accept a HEAD request and return a 200." The examples answer it with an empty `200`. Deploy that before you create the webhook, or pass `?bypass_ping=true`.

## 2. Create the Webhook

```bash
curl --request POST \
  --url https://api.surveymonkey.com/v3/webhooks \
  --header 'Authorization: Bearer {access-token}' \
  --header 'Content-Type: application/json' \
  --data '{
    "name": "Completed responses",
    "event_type": "response_completed",
    "object_type": "survey",
    "object_ids": ["123456789"],
    "subscription_url": "https://your-app.example.com/webhooks/surveymonkey"
  }'
```

- One `event_type` per webhook. Create one webhook per event you need.
- Each `subscription_url` must be unique across all webhooks in the account, whatever the event type. Add a query string (for example `?event=response_completed`) to reuse one endpoint.
- `bypass_ping=true` on `POST`, `PUT` or `PATCH` skips the `HEAD` check.
- Optional: `authorization` sets an `Authorization` header on every callback, and `verify_ssl` (default `true`) controls certificate checks.

## 3. Configure the Key

The HMAC key is `<client ID>&<client secret>` from your app's settings. Set `SURVEYMONKEY_CLIENT_ID` and `SURVEYMONKEY_CLIENT_SECRET`, and the examples join them. Apps on old authentication use their API key and API secret.

## Test

Complete a response on the survey and watch for `response_completed`.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 surveymonkey --path /webhooks/surveymonkey
```

Use the printed URL as `subscription_url`. A plain CLI source answers `HEAD` with `405`, so pass `?bypass_ping=true` (or first create a SurveyMonkey-type source named `surveymonkey`).

## Using Hookdeck

Create a source with the **SurveyMonkey** source type and paste `<client ID>&<client secret>` as one value. Hookdeck verifies `Sm-Signature`. Verification is optional on the source, and Hookdeck applies no timestamp window. Hookdeck answers SurveyMonkey's `HEAD` check with `200`. If creating the webhook still fails the check, create it with `?bypass_ping=true`.
