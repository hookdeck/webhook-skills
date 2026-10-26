# Setting Up Connecteam Webhooks

## Prerequisites

- A Connecteam account with access to the Connecteam API
- Your application's public webhook endpoint URL (HTTPS)

## Get Your Signing Secret

Connecteam doesn't generate a signing secret. You choose the shared value yourself:

> Set a secretKey when you create the webhook through the Connecteam API. Webhooks without one send nothing to verify.

1. Generate a long random string (for example `openssl rand -hex 32`).
2. Send it as `secretKey` when you create the webhook through the Webhook API.
3. Store the same value as `CONNECTEAM_WEBHOOK_SECRET` in your app.

`secretKey` is optional at creation. The docs don't say whether webhooks created in the dashboard can set it. Connecteam then sends that exact value in the `x-webhook-secret` header on every request. It does not sign or hash the body.

## Register Your Endpoint

Create the webhook with the Webhook API (see [Setting up a webhook via API](https://developer.connecteam.com/docs/setting-up-webhook-via-api)): provide your `url`, the `secretKey`, and the `eventTypes` you want, grouped by feature (users, forms, time_activity, shift_scheduler, tasks, chat). Recommended events to start with: `user_created`, `form_submission`, `clock_in`, `clock_out`, `shift_created`, `task_completed`.

To add event types later, GET the webhook first, then PUT the previous `eventTypes` plus the new names.

## HTTP Method

Only the Chat webhook guide names the method (`POST`, with `User-Agent: connecteam`); the setup page doesn't. Accept GET, POST, PUT, PATCH and DELETE on your route, as the examples do, and check the credential first for every method.

Hookdeck's Connecteam source pre-selects POST without managing the method, so any other method the sender uses must also be allowed on the source.

## Local Development

```bash
npx hookdeck-cli listen 3000 connecteam --path /webhooks/connecteam   # Express, Next.js
npx hookdeck-cli listen 8000 connecteam --path /webhooks/connecteam   # FastAPI
```

Use the URL it prints as the webhook `url`.

## Rotating the Secret

Update the webhook's `secretKey` through the API and `CONNECTEAM_WEBHOOK_SECRET` together. Requests sent with the old value get a 401 in between, so do it at a quiet time.
