# Setting Up Mailjet Webhooks

## Prerequisites

- Mailjet account
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 mailjet --path /webhooks/mailjet` for local development)

## Choose Credentials

Pick a username and a long random password and store them as `MAILJET_WEBHOOK_USERNAME` and `MAILJET_WEBHOOK_PASSWORD`. Percent-encode any special characters (`@`, `/`, `#`, `:`) when placing them in the URL.

## Register Your Endpoint (Dashboard)

1. Go to Mailjet account settings → **Event tracking** (Event notifications).
2. Choose the event type (`sent`, `open`, `click`, `bounce`, `spam`, `blocked`, `unsub`) and add your URL, with credentials embedded:
   ```
   https://username:password@your-domain.com/webhooks/mailjet
   ```
3. Optionally tick **Group events** so events arrive as arrays (recommended for `sent`).
4. Save. Repeat for each event type you want, one URL per event type.

## Register Your Endpoint (API)

```bash
curl -s -X POST https://api.mailjet.com/v3/REST/eventcallbackurl \
  -u "$MJ_APIKEY_PUBLIC:$MJ_APIKEY_PRIVATE" \
  -H 'Content-Type: application/json' \
  -d '{
    "EventType": "open",
    "Url": "https://username:password@your-domain.com/webhooks/mailjet",
    "Version": 2,
    "Status": "alive"
  }'
```

`Version: 2` enables grouped events. `IsBackup: true` registers a backup URL used if the primary is suspended.

## What Mailjet Sends

Mailjet posts JSON and includes `Authorization: Basic base64(username:password)`. It cannot send a signature or custom header.

## Reactivating a Suspended URL

After repeated failures Mailjet suspends the URL. Update it with a new URL (for example change the password or add a query string) to reactivate it.

## Test

Send a message through your account, then open it or click a link and watch your endpoint. See the [Mailjet webhooks guide](https://dev.mailjet.com/email/guides/webhooks/).
