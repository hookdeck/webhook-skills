# Setting Up Dropbox Webhooks

## Prerequisites

- A Dropbox account and an API app in the [Developer Console](https://www.dropbox.com/developers/console/apps)
- A publicly reachable HTTPS endpoint that handles the `challenge` GET and signed POSTs

## Get Your App Secret

1. Open your app in the Developer Console.
2. On the **Settings** tab, click **Reveal app secret** and copy the **App secret**.
3. Store it as `DROPBOX_APP_SECRET`. It is the key for `X-Dropbox-Signature`.

## Register Your Endpoint

1. On the app's **Settings** tab, in the **Webhooks** section, enter your webhook URI (for example `https://example.com/webhooks/dropbox`) and click **Add webhook**.
2. Dropbox immediately sends `GET <uri>?challenge=<value>`. Your server must reply `200` with the challenge value as the body, `Content-Type: text/plain`, and `X-Content-Type-Options: nosniff`.
3. The URI is only saved if that check passes. Start your server (or a Hookdeck tunnel) first.

There is no event selection. Dropbox notifies you of file changes for every account that has authorized the app.

## Local Development

```bash
npx hookdeck-cli listen 3000 dropbox --path /webhooks/dropbox
```

Register the Hookdeck URL as the webhook URI. FastAPI examples use port 8000.

## Development vs Production Apps

Apps in development status can link up to 500 Dropbox users, and once 50 are linked you have two weeks to get production approval before new links are frozen. Webhook URIs are registered per app, so use a separate app (and app secret) for staging.
