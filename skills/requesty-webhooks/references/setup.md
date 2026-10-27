# Setting Up Requesty Webhooks

## Prerequisites

- A Requesty organisation, with admin access (only admins can view or rotate the signing secret)
- A public `https://` URL for your endpoint. For local development, use the Hookdeck CLI (see below).

## Create a Signing Secret

Hookdeck's configuration alert for the Requesty source reads: "Create a signing secret for your Requesty
organization. Until one exists, deliveries are unsigned and fail verification."

1. Open the [Admin Panel](https://app.requesty.ai/admin-panel) and go to the **Alerts** tab.
2. Find the **Webhook signing secret** card.
3. Click the eye icon to reveal the secret, then the copy icon to copy it.

Requesty generates a secret automatically the first time you save a webhook URL. If your organisation has none
yet, click **Generate signing secret**. The secret starts with `whsec_`. Put the full value, prefix included, in
`REQUESTY_WEBHOOK_SECRET`. There is one secret per organisation, shared by every alert and sample request
webhook.

## Register Your Alert Webhook

An organisation has one alert webhook.

1. In the **Alerts** tab, click **Add Webhook**.
2. Choose the type: **JSON (Generic)** for this skill. **Slack** and **Teams** are for those services'
   incoming-webhook URLs.
3. Enter your webhook URL and click **Save**.
4. Click **Add Alert** to create thresholds. Alert types: User % of Budget, User Absolute Spend, Group % of
   Budget, Org Balance Below, API Key % of Budget, API Key Absolute Spend. You can create several thresholds per
   type, for example 50% and 80%.

Alerts are only sent when a valid webhook URL is configured, and each fires once per threshold crossing. No
challenge or validation request is sent when you save the URL.

## Register a Sample Request Receiver

Sample requests are configured per API request through the `requesty.sample` object, not in the Admin Panel:

```json
{
  "requesty": {
    "sample": { "webhook_url": "https://your-webhook-url.com/webhooks/requesty", "sample_ratio": 0.1 }
  }
}
```

`sample_ratio` is a number from 0 to 1. Sample requests are signed with the same organisation secret.

## Register Your Endpoint (Local Development)

```bash
# Express and Next.js
npx hookdeck-cli listen 3000 requesty --path /webhooks/requesty

# FastAPI
npx hookdeck-cli listen 8000 requesty --path /webhooks/requesty
```

No account is needed. Use the URL the CLI prints as the webhook URL, then lower an alert threshold or send a
sampled request to see an event arrive.

## Rotate the Secret

1. In the **Webhook signing secret** card, click the rotate icon.
2. Under **Stop signing with the current secret**, choose **Immediately** (use this if the secret was exposed)
   or **After 1, 2, 4, 8 or 24 hours** (24 is the default).
3. Click **Rotate secret**.

The new secret applies to the next delivery. Until the grace period ends, `webhook-signature` carries one
entry per active secret, so either secret verifies. An organisation can have at most 5 active secrets. Update
`REQUESTY_WEBHOOK_SECRET` before the grace period ends.

## Troubleshooting Delivery

- No `webhook-*` headers: the organisation has no signing secret yet (see above).
- Nothing arrives: check that a webhook URL is saved and that an alert threshold exists. Thresholds without a
  webhook are stored but never delivered.
- Slack and Teams type webhooks ignore the signature headers, so they can't be verified.
- Requesty times out after 15 seconds per attempt and retries up to 3 times. Return `2xx` quickly.
