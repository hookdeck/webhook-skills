# Setting Up tawk.to Webhooks

## Prerequisites

- tawk.to account with access to the `Admin` section
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 tawk-to --path /webhooks/tawk-to` locally)

## Create the Webhook and Get the Secret Key

1. Sign in to the tawk.to dashboard and open the `Admin` section.
2. Go to the webhooks settings and add a new webhook.
3. Enter your endpoint URL and choose the events to receive (menu labels: chat start, chat end, new chat transcript, new ticket).
4. Save. The webhook's **secret key** is shown when you create it; copy it into `TAWK_WEBHOOK_SECRET`.

(The exact menu names may change; the official docs only say webhooks are managed in the dashboard's `Admin` section.)

## Recommended Events

`chat:start`, `chat:end`, `chat:transcript_created`, `ticket:create`.

## Testing

Trigger a real chat or ticket from your widget. Inspect deliveries in the Hookdeck CLI web UI. There is no documented test-mode toggle.
