# Setting Up Pusher Channels Webhooks

## Prerequisites

- A Pusher Channels app (dashboard at https://dashboard.pusher.com)
- Your application's public webhook endpoint URL (HTTPS recommended; HTTP is also accepted)

## Get Your App Credentials

1. Go to the Pusher dashboard and open your Channels app.
2. Open the app's keys page and copy `app_id`, `key`, `secret` and `cluster`.
3. Put them in `PUSHER_APP_ID`, `PUSHER_APP_KEY`, `PUSHER_APP_SECRET` and `PUSHER_CLUSTER`.

The `secret` is the signing key. An app may have several tokens; Pusher signs with the oldest active token and names it in `X-Pusher-Key`.

## Register Your Endpoint

1. In your app, open the webhooks section (the dashboard configures webhooks per app).
2. Add a webhook, set the URL (for example `https://example.com/webhooks/pusher`) and choose the event types to send, such as channel existence, presence, client and cache miss events.
3. Optionally enable **batch webhooks** in the same section (your handler must loop over `events`).
4. For `subscription_count`, open **App Settings** and switch Subscription Count on. It is sent on every channel type except presence channels.
5. `client_event` only fires for client events sent on private or presence channels, so client events must be enabled for the app.

## Test Locally

```bash
npx hookdeck-cli listen 3000 pusher --path /webhooks/pusher
```

Use the printed Hookdeck URL as the webhook URL. Subscribe to a channel from a browser client to trigger `channel_occupied`.

## Rotating Tokens

When you create a new token and retire the old one, deliveries start arriving with a different `X-Pusher-Key`. Keep both key/secret pairs configured until the old one stops appearing.
