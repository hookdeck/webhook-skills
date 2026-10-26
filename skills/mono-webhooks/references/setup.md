# Setting Up Mono Webhooks

## Prerequisites

- A Mono account with an app created in the dashboard
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 mono --path /webhooks/mono` locally)

## Get Your Webhook Secret

Use the webhook secret from your app in the Mono dashboard.

1. Log in to the Mono dashboard and open the **Apps** page.
2. Open your app and go to its **Webhooks** section.
3. Once the app has a webhook URL, Mono generates a webhook secret. Copy it and store it as
   `MONO_WEBHOOK_SECRET`.

Mono sends this secret as plain text in the `mono-webhook-secret` header on every request, and
it should match the secret you passed when creating the webhook.

## Register Your Endpoint

1. In your app's page, click **Add webhook**.
2. Enter the URL of your backend endpoint, e.g. `https://example.com/webhooks/mono`.
3. Save. Mono posts events for the app to that URL.

## Test

Trigger a connection in the sandbox and check that your endpoint logs
`mono.events.account_connected`. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/mono \
  -H "Content-Type: application/json" \
  -H "mono-webhook-secret: $MONO_WEBHOOK_SECRET" \
  -d '{"event":"mono.events.account_connected","event_id":"evt_test_1","timestamp":"2026-01-27T21:00:39.588Z","data":{"id":"acc_1"}}'
```

## Notes

- The secret is per app. If one endpoint serves several apps, keep a secret per app.
- Respond with exactly `200 OK`; other responses are retried with exponential backoff for 48 hours.
