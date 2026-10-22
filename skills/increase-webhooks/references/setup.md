# Setting Up Increase Webhooks

## Prerequisites

- An Increase account (production, or a sandbox account for testing)
- Your application's public HTTPS webhook endpoint URL (use `npx hookdeck-cli listen 3000 increase --path /webhooks/increase` for local development)

## Create an Event Subscription

1. Create an Event Subscription in the Increase dashboard, or call the Event Subscriptions API (`POST /event_subscriptions`).
2. Set the **URL** to your endpoint (for Hookdeck, the source URL it gives you).
3. Choose a single event category to receive, or leave it unset to receive all of them.
4. Optionally set a `shared_secret`. If you don't, Increase generates a random one. It must be 1-100 characters.

## Get Your Signing Secret

The signing secret is the Event Subscription's `shared_secret` (an attribute of the Event Subscription object in the dashboard and API). Store it as `INCREASE_WEBHOOK_SECRET`.

Use the secret exactly as Increase shows it. It is raw key material, not a `whsec_` / base64 Standard Webhooks secret. If you pick your own, don't start it with `whsec_`.

## Headers on Each Request

| Header | Example |
|--------|---------|
| `webhook-id` | `event_123abc` |
| `webhook-timestamp` | `1674087231` |
| `webhook-signature` | `v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=` |

## Sandbox vs Production

Event Subscriptions are per environment. A sandbox subscription only receives sandbox Events, and sandbox deliveries are not retried. Create a separate subscription (with its own secret) for production.

## Test Your Endpoint

In the sandbox, simulate activity (for example, create an Account or an ACH Transfer through the API) to generate Events, and inspect the deliveries in Hookdeck.
