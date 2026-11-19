# Setting Up MakePlans Webhooks

## Prerequisites

- A MakePlans account with admin access. For testing, sign up for a trial in the test environment (app.test.makeplans.net).
- A public HTTPS endpoint (use the Hookdeck CLI locally)

## 1. Find the Account Secret

Open **Setup > Webhooks** in the MakePlans admin. The page shows the **Account secret** ("App secret for verifying webhooks"). Copy it. It's not the **API-key (for external integrations)** on the account settings, and the Account API doesn't return it.

## 2. Add a Webhook

On the same page, add a webhook with your URL and an event name (`booking.created`) or a wildcard (`booking.*`, `*`). You can also manage webhooks with the API (`POST /web_hooks`).

## 3. Configure the Secret

Set `MAKEPLANS_ACCOUNT_SECRET` to the Account secret.

## Test

Create a booking and watch for `booking.created`.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 makeplans --path /webhooks/makeplans
```

Use the printed URL as the webhook URL.

## Using Hookdeck

Create a source with the **MakePlans** source type and paste the Account secret from the Webhooks page, not the API key. Hookdeck verifies `X-MakePlans-Signature`.
