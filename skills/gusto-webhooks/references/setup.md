# Setting Up Gusto Webhooks

## Prerequisites

- A Gusto Developer Portal account and application ([dev.gusto.com](https://dev.gusto.com))
- A system access token (webhook subscription endpoints use system-level auth)
- A public HTTPS endpoint that accepts `POST` with JSON (use the Hookdeck CLI locally)

## Option A: Developer Portal

1. Sign in to the [Developer Portal](https://dev.gusto.com) and open your application.
2. Open the **Webhook subscriptions** tab to add, verify, edit and view subscriptions.
3. Add your URL, such as `https://your-app.example.com/webhooks/gusto`, and pick subscription types.

## Option B: API

```bash
curl --request POST \
  --url https://api.gusto-demo.com/v1/webhook_subscriptions \
  --header 'Authorization: Bearer {SYSTEM_ACCESS_TOKEN}' \
  --header 'Content-Type: application/json' \
  --data '{ "subscription_types": ["Company", "Employee", "Payroll"], "url": "https://your-app.example.com/webhooks/gusto" }'
```

The subscription starts in `pending`.

## Verify the Subscription

1. Gusto `POST`s a `verification_token` to your URL. The examples print it while `GUSTO_VERIFICATION_TOKEN` is unset.
2. Verify the subscription with it:

   ```bash
   curl --request PUT \
     --url https://api.gusto-demo.com/v1/webhook_subscriptions/{webhook_subscription_uuid}/verify \
     --header 'Authorization: Bearer {SYSTEM_ACCESS_TOKEN}' \
     --header 'Content-Type: application/json' \
     --data '{ "verification_token": "the-token" }'
   ```

3. Set `GUSTO_VERIFICATION_TOKEN` to the same token. It signs every event.

If the token never arrives, check that the endpoint is listening, then call `GET /v1/webhook_subscriptions/{uuid}/verification_token` to have Gusto send it again.

## Test

In the demo environment (`api.gusto-demo.com`), create or update an employee, or run a payroll, for a company subscribed to that type. The subscription's details page lists recent events.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 gusto --path /webhooks/gusto
```

Use the printed URL as the subscription URL.

## Using Hookdeck

1. Create a source with the **Gusto** source type, with verification off, and use its URL as the subscription URL.
2. The first request carries the `verification_token`. Copy it from the request in Hookdeck and call `PUT .../verify`.
3. Paste the token as the source's secret and turn verification on. Hookdeck then verifies `X-Gusto-Signature`, and applies no timestamp window.
