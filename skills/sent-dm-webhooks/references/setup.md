# Setting Up Sent Webhooks

## Prerequisites

- A Sent account
- A publicly reachable `http://` or `https://` endpoint (URLs that resolve to private or loopback IP ranges are rejected). Use a tunnel such as `npx hookdeck-cli listen 3000 sent-dm --path /webhooks/sent-dm` while developing.

## Register Your Endpoint

1. Open [Webhooks in the Sent Dashboard](https://app.sent.dm/dashboard/webhooks) and click **Add Webhook**.
2. Fill in **Display Name**, **Endpoint URL** and **Select events to listen** (selecting a family reveals its sub-types, so you can subscribe to just `delivered` and `failed`).
3. Click **Add Webhook**.

Programmatically, call `POST /v3/webhooks` with the same fields plus `event_types`, optional `event_filters`, `retry_count` (1-5, default 3) and `timeout_seconds` (5-120, default 30). Example filter: `{"event_types": ["message", "templates"], "event_filters": {"message": ["delivered", "failed", "received"]}}`. A `sender_profile` block clones the webhook onto your Sender Profiles.

## Get Your Signing Secret

Click the webhook, then use the **Eye** button to reveal the signing secret or **Copy** to copy it. It starts with `whsec_`. Store it as `SENT_WEBHOOK_SECRET`. Clones on Sender Profiles use the same secret as your webhook. Rotating the secret updates every clone.

## Send a Test Delivery

From the webhook's actions menu choose **Test Webhook**, then click **Test** next to an event. Sent sends a sample payload for it to your endpoint. The delivery shows as `DELIVERED` in the webhook's **Events** table when your endpoint returned `2xx`. Test deliveries make a single attempt.

## Re-enable a Disabled Webhook

After 10 consecutive failed events Sent disables the webhook. Fix the endpoint, then re-enable the webhook in the dashboard.

## Test Mode vs Live Mode

Test deliveries come from **Test Webhook** and use the same signing scheme. Sent also has a sandbox mode for sends; see Sent's testing guide.
