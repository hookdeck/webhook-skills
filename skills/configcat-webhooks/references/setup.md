# Setting Up ConfigCat Webhooks

## Prerequisites

- A ConfigCat account with access to the Webhooks screen of your product
- Your application's webhook endpoint URL (use `npx hookdeck-cli listen 3000 configcat --path /webhooks/configcat` locally)

## Get Your Signing Key

1. Open the **Webhooks** screen in the ConfigCat Dashboard.
2. Open (or add) your webhook and copy its **signing key**. It starts with `configcat_whsk_`.
3. Store it whole in `CONFIGCAT_WEBHOOK_SECRET`, including the prefix. Do not strip it or base64-decode it.

Keep a single signing key on the ConfigCat webhook and paste it whole, including the configcat_whsk_ prefix. With two keys, ConfigCat sends two signatures and verification fails. If the webhook uses GET, also allow GET on this source.

ConfigCat lets you add a secondary key for rotation, and then sends two comma-separated signatures. Both Hookdeck and the examples compare the whole header to one signature, so during a rotation they reject deliveries until the old key is removed.

## Register Your Endpoint

1. On the **Webhooks** screen, click **+ ADD WEBHOOK**.
2. Choose the **Config** and **Environment** whose changes should trigger the webhook.
3. Set the **URL** (your endpoint, or your Hookdeck source URL) and the **HTTP METHOD** (GET or POST).
4. Optionally add custom headers and a request body using `##Variable##` placeholders (see [overview.md](overview.md)).
5. Save.

## Hookdeck Source and the HTTP Method

Hookdeck's `CONFIGCAT` source pre-selects POST without managing the method. If your webhook uses GET, or any method other than POST, also allow that method on the source. The example handlers accept GET, POST, PUT, PATCH and DELETE.

## Test Your Webhook

1. Change a setting in the ConfigCat Dashboard.
2. Click **SAVE & PUBLISH CHANGES**.
3. Check that your endpoint was called and returned 2xx.
