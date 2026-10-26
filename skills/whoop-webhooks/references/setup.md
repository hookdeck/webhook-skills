# Setting Up WHOOP Webhooks

## Prerequisites

- A WHOOP developer account and an app in the [WHOOP Developer Dashboard](https://developer-dashboard.whoop.com/)
- A public HTTPS endpoint that accepts `POST`
- Users who have authorized your app through OAuth (webhooks are only sent for them)

## Get Your Signing Secret

Paste your WHOOP app's client secret from the Developer Dashboard. WHOOP signs webhooks with it; there is no separate webhook secret.

1. Open your app in the WHOOP Developer Dashboard.
2. Copy the app's **client secret**.
3. Store it as `WHOOP_WEBHOOK_SECRET` (and, if you use Hookdeck, paste it into the WHOOP source's signing secret field).

## Register Your Endpoint

1. In the Developer Dashboard, open your app (create or update it).
2. In the **Webhooks** section at the bottom, add your HTTPS URL as a Webhook URL.
3. Choose the **v2** model version (the default; v1 webhooks have been removed).
4. Save the app.

Each app needs its own webhook endpoint. All six event types are sent to every configured URL.

## Local Development

```bash
# Express and Next.js
npx hookdeck-cli listen 3000 whoop --path /webhooks/whoop

# FastAPI
npx hookdeck-cli listen 8000 whoop --path /webhooks/whoop
```

Use the printed Hookdeck URL as the Webhook URL.

## Testing

Per WHOOP: edit a sleep's start or end time by one minute in the WHOOP app to get `sleep.updated` and `recovery.updated`; log a past activity to get `workout.updated`. Editing or deleting it produces `workout.updated` / `workout.deleted`.
