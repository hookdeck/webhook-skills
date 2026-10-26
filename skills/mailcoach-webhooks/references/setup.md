# Setting Up Mailcoach Webhooks

## Prerequisites

- A Mailcoach account (hosted) or install (self-hosted) with access to settings
- A public HTTPS endpoint (or a Hookdeck source URL)

## Get Your Secret

You choose the secret yourself:

1. In Mailcoach, open the **Webhooks** screen in settings.
2. Create a webhook (or open an existing one) and go to its details page.
3. Enter a secret (a long random string) and store it as `MAILCOACH_WEBHOOK_SECRET`.

Set a secret on the Mailcoach webhook. Without one, deliveries are unsigned and fail verification.

## Register Your Endpoint

1. Enter your server URL, or the Hookdeck source URL when you route through the Event Gateway. The sample handlers in `examples/` listen on `POST /webhooks/mailcoach`.
2. Optionally choose which event types the webhook receives on its details page (`UnconfirmedSubscriberCreatedEvent`, `SubscribedEvent`, `UnsubscribedEvent`, `CampaignSentEvent`).
3. In the Hookdeck dashboard create a source of the Mailcoach type and paste the **same secret** into its verification settings. Hookdeck manages the method as POST.

Self-hosted extras (in `config/mailcoach.php`): `webhooks.logs` to keep a log of calls, `webhooks.selectable_event_types_enabled` for per-webhook event selection, and `webhooks.maximum_attempts` with `opt_in_features.disable_failed_webhooks` to disable a webhook after consecutive failures. Each needs the related migrations published and run.

## Test Mode vs Live Mode

Mailcoach documents no separate test mode for webhooks. Subscribe a test address to a list, unsubscribe it, or send a small campaign to trigger events.

## Local Development

```bash
npx hookdeck-cli listen 3000 mailcoach --path /webhooks/mailcoach
```

Use port `8000` for FastAPI. Put the Hookdeck URL in your Mailcoach webhook.
