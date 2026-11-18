# Setting Up Juniper Mist Webhooks

## Prerequisites

- A Mist organization (a 90-day trial starts when you create one) and an admin account
- A public HTTPS endpoint (use the Hookdeck CLI locally)

## Option A: The Portal

1. For an org-level webhook, go to **Organization > Settings**. For a site-level webhook, go to **Organization > Site Configuration** and pick the site.
2. In **Webhooks**, click **Add Webhook**.
3. Enter a **Name**, set **Webhook Type** to **HTTP Post**, and enter the **URL**.
4. Select at least one **Topic**.
5. Under **Advanced Settings**, set a **Secret**. Without one, Mist sends no signature headers.
6. Click **Add**.

## Option B: The API

```bash
curl -X POST "https://api.mist.com/api/v1/orgs/{org_id}/webhooks" \
  -H "Authorization: Token {api_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-receiver",
    "type": "http-post",
    "url": "https://your-app.example.com/webhooks/juniper-mist",
    "secret": "a-long-random-secret",
    "topics": ["alarms", "audits", "device-events"],
    "enabled": true,
    "verify_cert": true
  }'
```

Use your cloud's API host (`api.mist.com` is Global 01; other regions have their own). Site webhooks use `/api/v1/sites/{site_id}/webhooks`.

## Configure the Secret

Set `MIST_WEBHOOK_SECRET` to the same Secret.

## Test

Send a ping event:

```bash
curl -X POST "https://api.mist.com/api/v1/orgs/{org_id}/webhooks/{webhook_id}/ping" \
  -H "Authorization: Token {api_token}"
```

Admin actions (which produce `audits` events) are another way to trigger a delivery without devices.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 juniper-mist --path /webhooks/juniper-mist
```

Use the printed URL as the webhook URL.

## Using Hookdeck

Create a source with the **Juniper Mist** source type and paste the webhook's Secret. Hookdeck verifies `X-Mist-Signature-v2`. Only HTTP Post webhooks with a Secret are signed.
