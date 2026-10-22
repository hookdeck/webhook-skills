# Setting Up Luma Webhooks

## Prerequisites

- A Luma Plus subscription (webhooks are Plus-only)
- A calendar you manage
- A public HTTPS endpoint, e.g. `https://your-app.com/webhooks/luma`

## Create the Webhook and Get Your Secret

1. Go to [Calendars Home](https://luma.com/home/calendars) and select your calendar.
2. Open **Settings → Developer**.
3. In the **Webhooks** section, click **Create**.
4. Enter your webhook URL.
5. Select the action types to receive, or choose **All Actions**.
6. Click **Create**. Luma generates a secret starting with `whsec_`; store it as `LUMA_WEBHOOK_SECRET`.

The secret is used whole, as a UTF-8 string, for the HMAC key. Do not strip the `whsec_` prefix or base64-decode it.

You can also create webhooks with the API (`POST https://public-api.luma.com/v2/webhooks/create` with `url` and `event_types`, authenticated with the `x-luma-api-key` header). Event type names are dotted, e.g. `guest.registered`.

## Manage Webhooks

In **Settings → Developer**, click a webhook to see recent deliveries (delivered, pending, failed). You can pause, resume, or delete it. A `410 Gone` response pauses it automatically.

## Local Development

```bash
npx hookdeck-cli listen 3000 luma --path /webhooks/luma
```

Use the tunnel URL as the webhook URL. For FastAPI use port `8000`.
