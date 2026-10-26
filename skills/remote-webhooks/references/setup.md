# Setting Up Remote Webhooks

## Prerequisites

- A Remote account with API access
- A public HTTPS endpoint (use the Hookdeck CLI locally, below)

## Get Your Signing Key

There is no dashboard field for it. The `signing_key` is returned when you create the callback with
the API (`POST /v1/webhook-callbacks`). Store it as `REMOTE_WEBHOOK_SECRET` and use it exactly as
returned, as UTF-8 text.

## Register Your Endpoint

1. Call `POST /v1/webhook-callbacks` with your callback URL and the event types to subscribe to
   (see [Remote's webhook introduction](https://developer.remote.com/docs/introduction-to-webhooks)
   for the request body).
2. Save the `signing_key` from the response.
3. Subscribe to the events you handle, e.g. `employment.onboarding.completed`, `timeoff.requested`,
   `payslip.released`.

## Test Mode vs Live Mode

Remote provides a sandbox environment with its own API base URL and credentials, so register a
callback there first. Each environment returns its own signing key.

## Local Development

```bash
# Express and Next.js
npx hookdeck-cli listen 3000 remote --path /webhooks/remote

# FastAPI
npx hookdeck-cli listen 8000 remote --path /webhooks/remote
```

Register the URL the CLI prints as your callback URL.

## Recovering Missed Events

Remote never retries a 4xx or 5xx response. List and replay missed events through the webhook-events API.
