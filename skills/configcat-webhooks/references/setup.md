# Setting Up ConfigCat Webhooks

## Prerequisites

- A ConfigCat account with access to the Webhooks screen of your product
- Your application's webhook endpoint URL (use `npx hookdeck-cli listen 3000 configcat --path /webhooks/configcat` locally)

## Get Your Signing Key

1. Open the **Webhooks** screen in the ConfigCat Dashboard.
2. Open (or add) your webhook and copy its **signing key**. It starts with `configcat_whsk_`.
3. Store it whole in `CONFIGCAT_WEBHOOK_SECRET`, including the prefix. Do not strip it or base64-decode it.

ConfigCat lets you add a secondary key for rotation, and then sends two comma-separated signatures, one per key. The example handlers accept a match on any entry. With a Hookdeck source, paste the key whole, including the configcat_whsk_ prefix, and update the source's secret as soon as you rotate. If the webhook uses GET, also allow GET on the source.

## Register Your Endpoint

1. On the **Webhooks** screen, click **+ ADD WEBHOOK**.
2. Choose the **Config** and **Environment** whose changes should trigger the webhook.
3. Set the **URL** (your endpoint, or your Hookdeck source URL) and the **HTTP METHOD** (GET or POST).
4. Optionally add custom headers and a request body using `##Variable##` placeholders (see [overview.md](overview.md)).
5. Save.

## Hookdeck Source and the HTTP Method

Hookdeck's `CONFIGCAT` source accepts only the methods you allow ([custom methods](https://hookdeck.com/docs/sources#custom-methods)). If your webhook uses GET, or any method other than POST, also allow that method on the source. The example handlers accept GET, POST, PUT, PATCH and DELETE.

## Test Your Webhook

1. Change a setting in the ConfigCat Dashboard.
2. Click **SAVE & PUBLISH CHANGES**.
3. Check that your endpoint was called and returned 2xx.
