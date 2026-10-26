# Setting Up Logto Webhooks

## Prerequisites

- A Logto tenant (Logto Cloud or self-hosted) with Console access
- A publicly reachable HTTPS endpoint, e.g. `https://your-app.com/webhooks/logto`. Logto requires the URL to be reachable over HTTPS and not a localhost URL. For local development use a tunnel: `npx hookdeck-cli listen 3000 logto --path /webhooks/logto`

## Create the Webhook

1. In Logto Console, go to **Webhooks** and click **Create webhook**.
2. Enter a **Name** (for your own reference).
3. Enter the **Endpoint URL**.
4. Select the **events** that should trigger it. Pick only what you need; you can change the selection later.
5. Create the webhook. It is active immediately; use the three-dots menu to disable or reactivate it.

## Get the Signing Key

Open the webhook's details page in **Console > Webhooks**. Logto generates a unique **Signing key** for each webhook. Store it as `LOGTO_WEBHOOK_SECRET`. Use it exactly as shown (as UTF-8 bytes); don't decode it.

You can also add **custom headers** to the webhook if you want to send extra context with each request.

## Test the Connection

Click **Send test payload** on the webhook page. Logto sends a sample payload for each selected event to your endpoint. Test requests contain anonymous data and don't appear in the recent request history.

## Respond Quickly

Return `200` as soon as the signature is verified and the event is stored or queued. Waiting for long processing can cause a timeout, and Logto asks that you not return other status codes for processing errors; handle those on your own server. Invalid signatures are the exception: the examples answer `401`.

## Webhooks vs Actions

Webhooks are asynchronous and can't change the outcome of the sign-in in progress. If you need to run code before sign-in continues, use Logto Actions instead.
