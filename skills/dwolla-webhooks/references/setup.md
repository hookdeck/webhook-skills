# Setting Up Dwolla Webhooks

## Prerequisites

- A Dwolla account (a Sandbox account is fine to start) and API credentials
- A publicly accessible HTTPS endpoint (Dwolla cannot reach `localhost`; use `npx hookdeck-cli listen 3000 dwolla --path /webhooks/dwolla` locally)
- Capacity for at least 10 concurrent requests

## Create the Subscription and Secret

Dwolla has no generated signing secret. You choose a random secret and send it when creating the subscription. Generate one, e.g. `openssl rand -hex 32`, and store it securely as `DWOLLA_WEBHOOK_SECRET`.

You can also create the subscription in the Dashboard under Webhooks.

```http
POST https://api-sandbox.dwolla.com/webhook-subscriptions
Accept: application/vnd.dwolla.v1.hal+json
Content-Type: application/vnd.dwolla.v1.hal+json
Authorization: Bearer <access token>

{
  "url": "https://myapplication.com/webhooks/dwolla",
  "secret": "<your random secret>"
}
```

A `201 Created` response has an empty body; the `Location` header links to the subscription.

## Which Events You Get

Dwolla sends webhooks for all events on your application; you cannot subscribe to individual topics. Filter on `topic` in your handler and return 200 for topics you ignore.

## Unpausing

If your endpoint fails 400 times in a row (and 24 hours have passed since the last success), the subscription is paused. Fix the issue, then unpause from the Dashboard or the API to resume and retry failed webhooks.

## Sandbox vs Production

Sandbox (`api-sandbox.dwolla.com`) and Production (`api.dwolla.com`) have separate subscriptions and secrets. Use separate environment variables per environment.
