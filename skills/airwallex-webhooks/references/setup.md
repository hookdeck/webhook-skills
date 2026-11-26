# Setting Up Airwallex Webhooks

## Prerequisites

- An Airwallex account with access to the web app (Admin/Developer permissions)
- Your application's webhook endpoint URL, served over **HTTPS** (Airwallex's
  docs say your endpoint should use HTTPS)

## Register Your Endpoint & Get the Secret

1. Log in to the [Airwallex web app](https://www.airwallex.com/app/login).
2. Go to **Developer → Webhooks** and click **New webhook**.
3. Enter a **Name** and the **Notification URL**, e.g.
   `https://api.yourapp.com/webhooks/airwallex`.
4. Choose the **API version**. It defaults to your account's API version and
   decides the event names and payload fields you receive.
5. Select the events to listen for (the **Account** dropdown covers events from
   other accounts), then click **Submit**.
6. Retrieve the webhook's secret key in the web app and store it as
   `AIRWALLEX_WEBHOOK_SECRET`. Airwallex starts signing deliveries to the URL
   only after the secret has been retrieved, so do this before you rely on
   verification. **Each webhook URL has its own secret.**

## Environment Variable

```bash
AIRWALLEX_WEBHOOK_SECRET=your_webhook_secret   # the secret for THIS webhook URL
```

## Test Events

- Test events are signed with the secret key in the test event's
  `client-secret-key` header, **not** with your webhook's secret. Code that
  verifies with `AIRWALLEX_WEBHOOK_SECRET` rejects them unless it uses that key
  for test events.
- Re-deliver real past events from **Settings → Developer → Events**: filter by
  status, select events and click **Re-trigger**. Events can be re-triggered for
  30 days.
- The sandbox environment has its own web app, webhooks and simulation APIs for
  producing events without real money.

## IP Allowlisting

If your infrastructure restricts inbound traffic, allow Airwallex's published
webhook source IP addresses so deliveries are not blocked. The current IP list
is on
[Webhook IP addresses](https://www.airwallex.com/docs/developer-tools/webhook-ip-addresses),
with separate production and sandbox lists.
Do **not** rely on source IP alone for authentication — always verify the
`x-signature` (see [verification.md](verification.md)).

## Local Development

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 airwallex --path /webhooks/airwallex
```

This gives you a public HTTPS URL to register in the Airwallex web app plus a web
UI to inspect and replay requests. Use `8000` as the port for the FastAPI example.
