# Setting Up Bitrise Webhooks

## Prerequisites

- A Bitrise project where you have the **Admin** role, or a custom role with the **Edit workflows** permission
- A public HTTPS URL for your endpoint (use `npx hookdeck-cli listen 3000 bitrise --path /webhooks/bitrise` locally)

## Choose a Secret Header

Bitrise doesn't sign webhooks, so you invent the credential. Pick a header name and a long
random value, for example:

```
X-Webhook-Secret: 9f2b6c1e-long-random-value
```

Or use `Authorization` with whatever value you like. Store the header name and the **exact
whole value** in your environment:

```bash
BITRISE_WEBHOOK_HEADER=X-Webhook-Secret
BITRISE_WEBHOOK_SECRET=9f2b6c1e-long-random-value
```

If you use `Authorization: Bearer abc123`, then `BITRISE_WEBHOOK_SECRET` is `Bearer abc123`,
prefix included. The handler compares the whole value.

## Register a CI Build Webhook

1. Open your project on Bitrise and click **Project settings**.
2. Select **Integrations**, then the **Webhooks** tab.
3. Scroll to **Outgoing Webhooks** and click **Add webhook**.
4. Enter your endpoint URL.
5. Choose **Send me everything** or **Select individual events**.
6. In **Headers**, enter your header name and value, then click **Add header**. Tick **Hide** to
   hide the value. You can't view or change a hidden value again, so keep a copy.
7. Click **Create webhook**.

You can also create webhooks (with a `headers` map) through the Bitrise API:
`POST /apps/{app-slug}/outgoing-webhooks`.

## Register a Release Management Webhook

1. Create the outgoing webhook as above, so it exists on Bitrise.
2. Open **Release Management**, select your app, and select a release that hasn't finished (or
   **Release presets** to configure a template).
3. Go to **Configuration**, find the **Outgoing webhooks** card, click **Show details**, then
   **Add webhook**.
4. Pick the webhook from the **Webhook configuration** menu and select the events that trigger it.

## Test Your Endpoint

In the project's Webhooks tab, open the webhook's recent deliveries (the history icon) to see the
request and your response, and to redeliver a payload. A `401` there almost always means the
header name or value doesn't match your environment variables.

## Firewalls

Bitrise sends the request from its own infrastructure, so the endpoint must be reachable from the
internet. For services behind a firewall, Bitrise recommends calling them from inside the build
instead of using outgoing webhooks.
