# Setting Up OnceHub Webhooks

## Prerequisites

- A OnceHub account where you are an administrator (Account Integrations)
- A public HTTPS endpoint (e.g. `https://your-app.com/webhooks/oncehub`); OnceHub requires `https://`

## Create the Webhook and Get Your Secret

1. Click the gear icon (top right) and select **Account Integrations**.
2. Select the **APIs & Webhooks** tile.
3. In the Webhooks section, click **Create Webhook**.
4. Enter a unique **Webhook Name** and the **Webhook URL**, then click **Next**.
5. Select the events that should trigger the webhook (e.g. `booking.scheduled`, `booking.rescheduled`,
   `booking.canceled`, `booking.completed`, `booking.no_show`).
6. Click **Create**. The **Webhook Secret** is displayed: click **Copy & close** and store it as
   `ONCEHUB_WEBHOOK_SECRET`.

You can see the secret again later on the API & Webhooks Integration page: find the webhook and
click **View secret**.

## v1 vs v2 Webhooks

Only v2 webhooks are signed. If **View secret** doesn't appear for a webhook, it is a v1 webhook:
it sends no `Oncehub-Signature` header and its requests can't be verified. Create a new webhook
(new webhooks are v2) and delete the old one. You can also create webhooks with `POST /webhooks`;
the returned object has `api_version` and `secret`.

## Test Your Endpoint

Create a sample booking in your account to trigger `booking.scheduled`, and inspect the request with
a tool like webhook.site or the Hookdeck CLI.

## Local Development

```bash
npx hookdeck-cli listen 3000 oncehub --path /webhooks/oncehub
```

Use the tunnel URL as the Webhook URL (it is HTTPS). For FastAPI use port `8000`.

## Retries

Non-`2xx` responses are retried with exponential backoff for about 3 days, after which the webhook
is disabled ([Webhook Delivery Retries](https://help.oncehub.com/developers/webhooks/using-webhooks/#webhook-delivery-retries)).
Return `2xx` as soon as the payload is accepted.
