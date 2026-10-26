# Setting Up Chili Piper Webhooks

## Prerequisites

- A Chili Piper account with **Admin** or **Workspace Manager** access (Routing & Scheduling or All Products)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 chili-piper --path /webhooks/chili-piper` for local development)

## Register Your Endpoint

1. Open the **Command Center** and go to the **Integrations** pane, then **Custom Webhooks**.
2. Click **Create Custom Webhook** and pick the type: **For New Meeting**, **For Meeting Update** or **For Canceled Meeting**.
3. Paste your webhook URL and click **Create**.
4. Set the status to **Enabled**. The webhook does nothing until it is enabled.

Create one webhook per type you need. They can all point at the same URL, because the body's `type` (`Created`, `Updated`, `Deleted`) tells them apart.

## Get Your Signing Secret

Chili Piper issues the signing secret on request: email Chili Piper support for your tenant's secret and paste it here.

Each tenant has its own secret and it is not displayed in the Command Center.

1. Create your webhook and enable it (above).
2. Email support@chilipiper.com. Include your instance (tenant) name and the webhook you created so the team can find the right key.
3. Store the secret as `CHILI_PIPER_WEBHOOK_SECRET`. Never commit it or expose it in client-side code.

To rotate the secret, email support again. Rotation invalidates the old secret immediately, so update your environment variable right away.

## Test Mode vs Live Mode

Chili Piper has no separate test mode for custom webhooks. Check your signature code offline with the test vector in [verification.md](verification.md), then book, reschedule and cancel a test meeting to trigger `Created`, `Updated` and `Deleted`.
