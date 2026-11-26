# Setting Up Attentive Webhooks

## Prerequisites

- An Attentive account with access to the custom app / integrations settings
- Your application's public HTTPS webhook endpoint URL (e.g.
  `https://your-app.com/webhooks/attentive`)

Attentive offers two webhook types. Both deliver identical payloads and sign
with the same `x-attentive-hmac-sha256` header. A **universal** webhook sends
events for every company that installs your app to one URL; a **subscription**
webhook gives each installing company its own URL.

## Option A: Dashboard (Universal webhooks)

1. Go to the Attentive integrations setup page and select your **custom app**.
2. Open the **Webhooks** tab.
3. Enable the **Event Webhook Status** toggle.
4. Choose **Universal webhook** as the webhook type.
5. Enter your **HTTPS URL** (e.g. `https://your-app.com/webhooks/attentive`).
6. **Save the Signing key** shown on this tab somewhere secure — this is the
   secret you use to verify signatures. Attentive's docs also call it a client
   secret and say it is unique per webhook.
7. Select the events you want to receive (e.g. `sms.subscribed`,
   `sms.unsubscribed`, `email.opened`).
8. Click **Save**.

## Option B: Webhooks API (Subscription webhooks)

On the custom app's **Webhooks** tab, enable **Event Webhook Status**, choose
**Subscription webhook**, copy the **Signing key** and save. Then create each
company's webhook with `POST https://api.attentivemobile.com/v1/webhooks`
(body: `url` and an `events` array, OAuth scope `webhooks:write`) or the GraphQL
`createWebhook` mutation. The API response does not include the signing key.
Edit subscription webhooks through the API, not the dashboard. See
[Create webhook](https://docs.attentive.com/reference/createwebhook).

## Get Your Signing Key

The **Signing key** is shown on the custom app's **Webhooks** tab for both
webhook types. Store it as an environment variable — never commit it:

```bash
ATTENTIVE_WEBHOOK_SECRET=your_signing_key
```

Signature verification is optional but **strongly recommended**. Without it, any
party who learns your endpoint URL could post forged events.

## Testing Your Endpoint

- Next to the **HTTP Post URL** field, click **Send test event**, pick an event
  type and send its example payload. The dialog shows the response; Attentive
  expects a `200`.
- For local development, tunnel public traffic to your local server with the
  Hookdeck CLI (no account required):

  ```bash
  npx hookdeck-cli listen 3000 attentive --path /webhooks/attentive
  ```

  Use the printed URL as your webhook URL in the Attentive settings.

## Retry & Auto-Disable Behavior

- Failed deliveries (non-2xx) are retried with exponential backoff for up to
  **3 days**.
- Endpoints that keep failing for multiple consecutive days are **automatically
  disabled** — monitor your endpoint's health and return 2xx promptly.
- Event delivery order is **not guaranteed**; process events idempotently.
