# Setting Up Wistia Webhooks

## Prerequisites

- A Wistia account with access to Account Settings
- Your application's public webhook endpoint URL (use `npx hookdeck-cli listen 3000 wistia --path /webhooks/wistia` for local development)

## Register Your Endpoint and Set the Secret Key

1. In Wistia, open the **Webhooks** section of your **Account Settings**.
2. Paste your endpoint URL into the **POST URL** field.
3. Enter a **Secret Key**. It can be any value you choose; Wistia uses it as the HMAC key and does not generate one for you. Store it as `WISTIA_WEBHOOK_SECRET`.
4. Select the events you want to receive (see [overview.md](overview.md)).
5. Click **Submit**.

## Authentication

Wistia authenticates deliveries with the `X-Wistia-Signature` HMAC header only. There is no OAuth, Basic Auth or API key on the webhook request, so verify the signature on every request.

## Respond Quickly

Return a `2xx` within 10 seconds. Slower responses time out and Wistia may resend the message, so acknowledge first and process asynchronously, and dedupe on each event's `uuid`.

## Testing

Trigger events by uploading a video (`media.created`, `media.processing`, `media.ready`), playing one (`viewing_session.play`) or editing its title (`media.updated`), and inspect the deliveries in the Hookdeck CLI web UI. Wistia has no separate test mode.
