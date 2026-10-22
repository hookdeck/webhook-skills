# Setting Up Todoist Webhooks

## Prerequisites

- A Todoist account
- A Todoist app in the [App Management Console](https://developer.todoist.com/appconsole.html)
- A public HTTPS endpoint with no port (e.g. `https://example.com/webhooks/todoist`)

## Get Your Signing Secret

Todoist has no separate webhook secret. Webhooks are signed with your app's **Client Secret**:

1. Open the App Management Console and select your app
2. Copy the **Client Secret**
3. Store it as `TODOIST_CLIENT_SECRET`

## Register Your Endpoint

1. In the app's settings, find the **Webhooks** section
2. Enter your **Webhook callback URL** (HTTPS, no port)
3. Select the events to watch (e.g. `item:added`, `item:completed`, `note:added`, `project:added`)
4. Set the webhook version and save

## Activate Webhooks for Your Own Account

Webhooks do not fire for the user who created the app until that user completes the app's OAuth flow. For personal use: open the authorization URL in a browser, capture the `code` from the redirect, then POST it to the token endpoint (`https://todoist.com/oauth/access_token`, e.g. via Postman or curl). Users who authorize your app afterwards are activated automatically.

## Local Testing

```bash
npx hookdeck-cli listen 3000 todoist --path /webhooks/todoist
```

Use the Hookdeck URL as the callback URL. Because there is a single URL per app and no test mode, use a separate Todoist app for development and production.

## Constraints

- HTTPS only; ports in the URL are rejected
- Respond 200 within a reasonable time; non-200 triggers a retry (15 minutes, up to 3 times)
