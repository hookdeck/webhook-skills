# Setting Up Dropbox Webhooks

## Prerequisites

- A Dropbox account and an API app in the [App Console](https://www.dropbox.com/developers/apps)
- A publicly reachable HTTPS endpoint that handles the `challenge` GET and signed POSTs

## Get Your App Secret

1. Open your app in the App Console.
2. On the **Settings** tab, copy the **App secret** (click "Show").
3. Store it as `DROPBOX_APP_SECRET`. It is the key for `X-Dropbox-Signature`.

## Register Your Endpoint

1. In the app's **Webhooks** section, enter your **Webhook URI** (for example `https://example.com/webhooks/dropbox`) and click **Add**.
2. Dropbox immediately sends `GET <uri>?challenge=<value>`. Your server must reply `200` with the challenge value as the body, `Content-Type: text/plain`, and `X-Content-Type-Options: nosniff`.
3. The URI is only saved if that check passes. Start your server (or a Hookdeck tunnel) first.

There is no event selection. Dropbox notifies you of file changes for every account that has authorized the app.

## Local Development

```bash
npx hookdeck-cli listen 3000 dropbox --path /webhooks/dropbox
```

Register the Hookdeck URL as the webhook URI. FastAPI examples use port 8000.

## Development vs Production Apps

Apps in development status are limited to 100 users. Webhook URIs are registered per app, so use a separate app (and app secret) for staging.
