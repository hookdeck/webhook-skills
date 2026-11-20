# Setting Up Roblox Webhooks

## Prerequisites

- A Roblox experience you own. For group-owned games, only **group owners** can configure and receive webhook notifications.
- A public HTTPS endpoint that accepts POSTs and returns 2xx within 5 seconds. For local development, use the Hookdeck CLI tunnel below.

## How Do I Create a Webhook?

1. Select your experience on the [Creator Hub](https://create.roblox.com/).
2. In the left-hand navigation, go to **Configurations** → **Webhooks** (also at https://create.roblox.com/settings/webhooks).
3. Click **Add Webhook**.
4. Enter your webhook URL, for example `https://your-app.example.com/webhooks/roblox`, and a name.
5. **Enter a secret.** Roblox marks this step optional. **Treat it as required:** without a secret, Roblox sends only `roblox-signature: t=<timestamp>` and you can't tell a real notification from a forged one. Generate a long random value:
   ```bash
   openssl rand -base64 32
   ```
6. Choose the triggers you want (Subscription, Compliance, Commerce, Refunds, Experiments).
7. Optionally click **Test Response** to send a sample request.
8. Click **Save Changes**.

You can configure up to 5 webhooks in total.

## Where Do I Put the Secret?

The secret you typed in step 5 is the HMAC key. Put the same string in your environment:

```bash
ROBLOX_WEBHOOK_SECRET=the-secret-you-typed-in-the-creator-dashboard
```

It's used as-is (UTF-8 bytes). It isn't base64-decoded and has no prefix.

This is **not** an Open Cloud API key, an OAuth client secret or a universe key. Those are only for calling Roblox APIs. The right-to-erasure worker needs an Open Cloud API key separately:

```bash
ROBLOX_OPEN_CLOUD_API_KEY=...   # Creator Hub → Open Cloud → API Keys; data stores "Delete Entry" permission
```

## How Do I Receive Analytics Alerts?

Analytics alerts use the same experience-level webhooks. Create the webhook as above, then go to **Configurations** → **Alerts**, create or edit an alert, and select the webhook under **Delivery channel**. These arrive with `EventType: "AnalyticsAlert"`. Creating experience-level webhooks for alerts needs the **List, create, update, and delete webhooks** permission.

## How Do I Test Locally?

Run the example, then open a tunnel with the Hookdeck CLI. No install or account is required:

```bash
# Express or Next.js
npx hookdeck-cli listen 3000 roblox --path /webhooks/roblox

# FastAPI
npx hookdeck-cli listen 8000 roblox --path /webhooks/roblox
```

Paste the printed HTTPS URL into the webhook, then:

1. Open the [Webhooks](https://create.roblox.com/settings/webhooks) page.
2. Click the pencil icon next to the webhook.
3. Click **Test Response**.

Roblox sends a `SampleNotification`:

```json
{
  "NotificationId": "string",
  "EventType": "SampleNotification",
  "EventTime": "2023-12-30T16:24:24.2118874Z",
  "EventPayload": { "UserId": 1 }
}
```

"If you provide a secret when configuring the webhook, it also generates a `roblox-signature` that you can use to test the `roblox-signature` logic." If your handler logs `missing_v1`, the webhook has no secret saved.

Use **Test Response** to confirm verification works. To learn the `EventType` strings for subscription, commerce, refund and experiment triggers (Roblox doesn't publish them), log `EventType` from real deliveries in a test experience.

## What If Deliveries Stop?

After 5 failed attempts Roblox "assumes that the URL is no longer valid". Fix the endpoint, then open the webhook and save it again with the working URL. Use **Test Response** to confirm.

## Is There an IP Allowlist?

No. Roblox doesn't publish source IP ranges. Authenticate with the `roblox-signature` HMAC instead.
