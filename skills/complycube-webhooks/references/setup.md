# Setting Up ComplyCube Webhooks

## Prerequisites

- A ComplyCube account
- A publicly reachable **HTTPS** endpoint URL (plain HTTP is not accepted)

## Register Your Endpoint

Webhooks can be created in the ComplyCube web portal or with the API (`POST /webhooks`).

1. Provide the endpoint URL (HTTPS) and an optional description.
2. Choose the events to receive, for example `check.completed`, `check.completed.clear`,
   `client.created`, `workflow.session.completed`. Avoid `["*"]`: ComplyCube recommends subscribing
   only to what you use.
3. Make sure the webhook is enabled.

You can change the subscribed events later in the portal or via the API (update a webhook).

## Get Your Webhook Secret

The webhook's `secret` is **only returned once, at creation**. Store it as `COMPLYCUBE_WEBHOOK_SECRET`
and treat it like a password. Each webhook endpoint has its own secret.

## Setup with Hookdeck

1. Create a Hookdeck source and copy its URL.
2. Create the ComplyCube webhook pointing at that URL and copy the secret.
3. Paste the secret into the Hookdeck source's webhook verification settings (HMAC, SHA-256, header
   `ComplyCube-Signature`, hex).

## Local Development

```bash
npx hookdeck-cli listen 3000 complycube --path /webhooks/complycube
```

## Testing

ComplyCube's test environment (see "Testing Data" in its docs) lets you create checks and receive their
completion events. A temporary
endpoint such as webhook.site is useful for inspecting a delivery.

## If a Webhook Gets Disabled

After 10 failed retries ComplyCube disables the webhook. Fix the endpoint (respond `20x` within 15
seconds) and re-enable the webhook via the portal or by updating it with `enabled: true`.
