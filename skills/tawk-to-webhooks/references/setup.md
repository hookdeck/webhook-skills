# Setting Up tawk.to Webhooks

## Prerequisites

- tawk.to account with access to the `Administration` section
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 tawk-to --path /webhooks/tawk-to` locally)

## Create the Webhook and Get the Secret Key

1. Sign in to the tawk.to dashboard and select the property.
2. Click **Administration**, click **Webhooks** under **Settings**, then click **Create Webhook**. A property can have up to 10 webhooks.
3. Enter a name and your HTTPS endpoint URL, and choose the events to receive (Chat Start, Chat End, New ticket, New Chat Transcript).
4. Save, then copy the webhook's **secret key** into `TAWK_WEBHOOK_SECRET`. tawk.to's docs don't say where the dashboard shows the key.

(Steps from tawk.to's help center: https://help.tawk.to/article/creating-and-managing-webhooks)

## Recommended Events

`chat:start`, `chat:end`, `chat:transcript_created`, `ticket:create`.

## Testing

Trigger a real chat or ticket from your widget. A transcript is sent after 3 minutes of inactivity. Inspect deliveries in the Hookdeck CLI web UI. There is no documented test-mode toggle.
