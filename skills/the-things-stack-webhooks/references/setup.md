# Setting Up The Things Stack Webhooks

## Prerequisites

- An application in The Things Stack (The Things Network, The Things Stack Cloud or your own deployment)
- A public HTTP(S) endpoint that returns `200` (use the Hookdeck CLI locally)

## 1. Add a Custom Webhook

1. In the Console, open your application and choose **Integrations > Webhooks**.
2. Click **+ Add webhook** and choose **Custom webhook**.
3. Give it a **Webhook ID** and choose **JSON** as the webhook format.
4. Set **Base URL** to your endpoint, such as `https://your-app.example.com/webhooks/the-things-stack`. The Things Stack says the endpoint must return `200 OK`. Check that it's reachable first.

## 2. Turn On Request Authentication

Check **Request authentication** and enter a username and password. The Console stores `Authorization: Basic base64(username:password)` on the webhook, and every request carries it. Set the same values as `TTS_WEBHOOK_USERNAME` and `TTS_WEBHOOK_PASSWORD`.

## 3. Choose Event Types and Paths

Tick the message types you want under **Enabled event types** (for example Uplink message and Join accept). Each type's path is appended to the Base URL. If you leave a path empty, that type goes to the Base URL itself. The examples tell types apart from the body, so leaving every path empty works.

## Optional

- **Downlink API key**: sent as `X-Downlink-Apikey` with every message, with `X-Downlink-Push` and `X-Downlink-Replace` URLs, so your service can schedule downlinks. Don't log it.
- **Filter event data**: push only chosen paths, such as `up.uplink_message`.
- **Retries** (The Things Stack Cloud Plus): tick **Retries** to queue and retry failed requests.

## Test

Send an uplink from a device, or simulate one from the end device's **Messaging** tab in the Console. Failed requests show up as `as.webhook.fail` events in **Live data**.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 the-things-stack --path /webhooks/the-things-stack
```

Use the printed URL as the Base URL.

## Using Hookdeck

Create a source with **The Things Stack** source type and enter the username and password you set in Request authentication. Hookdeck checks the `Authorization` header.
