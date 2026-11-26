# Setting Up Mailcoach Webhooks

## Prerequisites

- A Mailcoach account with access to your team's settings
- A public HTTPS endpoint (or a Hookdeck source URL)

## Create the Webhook and Get Your Secret

1. In Mailcoach, open your team's **Settings > Webhooks** and click **Create webhook**.
2. Enter a name and your receiver's HTTPS URL: your server, or the Hookdeck source URL when you route through Event Gateway. The sample handlers in `examples/` listen on `POST /webhooks/mailcoach`.
3. On the webhook's details page, copy the generated secret and store it privately as `MAILCOACH_WEBHOOK_SECRET`.
4. To receive only some events, clear **Use for all events**, choose the types, and save.
5. For a Hookdeck source, create a source of the Mailcoach type and paste the same secret into it.

Webhook URLs and event selection are configured in the interface; Mailcoach's API doesn't manage webhook settings.

## Test Mode vs Live Mode

Mailcoach documents no separate test mode for webhooks. Subscribe a test address to a list, unsubscribe it, or send a small campaign to trigger events, then check **Webhook logs** on the webhook's details page.

## Local Development

```bash
npx hookdeck-cli listen 3000 mailcoach --path /webhooks/mailcoach
```

Use port `8000` for FastAPI. Put the Hookdeck URL in your Mailcoach webhook.
