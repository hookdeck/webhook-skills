# Setting Up Chatim Webhooks

## Prerequisites

- A Chatim account with a project that has the chat widget installed
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Register Your Endpoint

1. Log in to the Chatim dashboard and select your project in the sidebar.
2. Click **Webhooks** in the navigation menu, then **Create Webhook**.
3. Enter an optional **Name** (for example `CRM Integration`) and the **URL** that should receive events.
4. Select the **Events** to receive, e.g. `chat.started`, `chat.form.submitted`, `chat.closed`.
5. Click **Create**.

## Get Your Webhook Secret

After creation Chatim shows the **Webhook Secret**. **Copy it immediately: it is only shown once.** Set it as `CHATIM_WEBHOOK_SECRET`.

If it leaks or you lose it, click **Regenerate Secret**, save the new one and update your endpoint. The old secret stops working immediately.

## Test Your Endpoint

Click **Test** on a webhook to send a sample `chat.started` event to your URL. Open a webhook to see recent deliveries (event, time, HTTP status, error message); history is kept 30 days.

## Disabled Webhooks

After 10 consecutive failures Chatim disables the webhook. Check the disabled reason in the dashboard, fix the endpoint, click **Enable**, then use **Test** to confirm.

## Local Development

```bash
npx hookdeck-cli listen 3000 chatim --path /webhooks/chatim
```

Use the Hookdeck URL as the webhook URL in Chatim, then click **Test**.
