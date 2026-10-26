# Setting Up Spacelift Webhooks

## Prerequisites

- A paid Spacelift account with permission to manage integrations
- Your application's public endpoint URL (use the Hookdeck CLI locally)

## Create the Webhook and Secret

Set a secret on the Spacelift webhook. Without one, deliveries are unsigned and fail verification.

1. In Spacelift go to **Integrations -> Webhooks** and create a webhook.
2. Enter your endpoint URL, e.g. `https://your-app.example.com/webhooks/spacelift`.
3. Enter a **Secret** (marked optional in the UI, but required for verification here). You choose its value.
4. Save. The secret cannot be modified afterwards: to rotate it, delete and recreate the webhook.
5. Set `SPACELIFT_WEBHOOK_SECRET` in your app to the same value. It is used as UTF-8 bytes as-is.
6. Optionally enable **Retry on failure** (up to 3 retries, only on `5xx`).

## Route Messages with a Notification Policy

A webhook only receives what a notification policy sends to it. Create a notification policy that targets the webhook for run state changes and/or internal errors. Check the Spacelift docs for the policy syntax.

## HTTP Method

Spacelift's docs don't name the HTTP method. Hookdeck's Spacelift source pre-selects POST without managing the method, so any other method the sender uses must also be allowed on the source. The examples accept `GET`, `POST`, `PUT`, `PATCH` and `DELETE`.

## Test Locally

```bash
npx hookdeck-cli listen 3000 spacelift --path /webhooks/spacelift
```

Use the URL it prints as the webhook endpoint. Check each delivery and its status code under the webhook's deliveries in Spacelift.

## Failure Behaviour

After 10 or more consecutive failures Spacelift auto-disables the webhook; re-enable it manually after fixing the endpoint.
