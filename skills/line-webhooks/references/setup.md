# Setting Up LINE Webhooks

## Prerequisites

- A LINE Business ID and a provider in the [LINE Developers Console](https://developers.line.biz/console/)
- A **Messaging API channel** (one per LINE Official Account)
- **Admin** role on the channel (needed to view or reissue the channel secret)
- A public **HTTPS** webhook URL. LINE doesn't send to plain HTTP.

## Get Your Channel Secret

1. Open the [LINE Developers Console](https://developers.line.biz/console/) and select your provider.
2. Open your Messaging API channel → **Basic settings** tab.
3. Copy **Channel secret** and store it as `LINE_CHANNEL_SECRET`.

The channel secret is the HMAC key for `x-line-signature`. It is **not** the channel access token (that one is on the Messaging API tab and is used to call the API, e.g. to reply).

**Reissuing**: clicking **Issue** next to the channel secret invalidates the old one immediately. If verification suddenly starts failing, check whether another admin reissued it. There is no overlap period, so update your server as soon as you reissue.

## Register Your Endpoint

1. Open the channel's **Messaging API** tab.
2. Under **Webhook settings**, click **Edit** next to **Webhook URL** and enter your endpoint, e.g. `https://example.com/webhooks/line`.
3. Click **Verify**. LINE sends a signed request with an empty `events` array. Your handler must verify the signature and return `200`; the console shows **Success** if it does.
4. Turn on **Use webhook**.
5. Optional: turn on **Webhook redelivery** so that LINE retries requests that get a non-2xx response. Deduplicate on `webhookEventId` if you enable it.
6. Optional: turn on **Error statistics aggregation** to see failed deliveries under **Statistics**.

You don't choose individual event types; LINE sends every event that applies to the account.

In the [LINE Official Account Manager](https://manager.line.biz/) (**Settings → Response settings**), turn **Webhooks** on. If you don't want the default auto-reply messages competing with your bot, turn **Auto-response messages** off.

You can also set the URL programmatically with `PUT https://api.line.me/v2/bot/channel/webhook/endpoint` and test it with `POST https://api.line.me/v2/bot/channel/webhook/test` (both use the channel access token).

## Local Development

LINE needs a public HTTPS URL. Tunnel to your local server with the Hookdeck CLI (no account required):

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 line --path /webhooks/line

# FastAPI
npx hookdeck-cli listen 8000 line --path /webhooks/line
```

Paste the printed URL into **Webhook URL**, click **Verify**, then message your Official Account from the LINE app.

## Test Mode vs Live Mode

LINE has no separate test mode. To test safely:

- Create a separate provider/channel for development, with its own channel secret and webhook URL.
- Use the console **Verify** button (empty `events`) as a smoke test.
- Add the account as a friend from your own LINE app (scan the QR code on the Messaging API tab) to generate real `follow` and `message` events.
- Sign test payloads yourself: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$LINE_CHANNEL_SECRET" -binary | openssl base64`.
