# Setting Up Shortcut Webhooks

## Prerequisites

- A Shortcut workspace where you can manage integrations (Outgoing Webhooks)
- Your application's public HTTPS webhook endpoint URL

## Choose a Webhook Secret

Shortcut only signs events if you provide a secret when you create the Outgoing Webhook. Without one, no `Payload-Signature` header is sent and you cannot verify authenticity. Generate one:

```bash
openssl rand -hex 32
```

Store it as `SHORTCUT_WEBHOOK_SECRET`.

## Register Your Endpoint

1. In Shortcut, open the Outgoing Webhook settings (see Shortcut's Help Center article on Webhooks for screenshots and the current menu location)
2. Enter your endpoint URL (for example `https://your-app.com/webhooks/shortcut`)
3. Enter the secret you generated
4. Save

Shortcut notifies the URL about story and epic changes (including comments and tasks). The API docs describe no per-event filter, so ignore actions you don't need in your handler.

## Test Locally

Shortcut suggests Tailscale Funnel, ngrok or Webhook.site for local testing. With the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 shortcut --path /webhooks/shortcut
```

Use the printed URL as the webhook URL, then edit a story to trigger an event.

## Responding

Return a `2xx` quickly after verifying the signature. The docs do not describe a retry schedule, so make handlers idempotent using the event `id` and consider queueing work.
