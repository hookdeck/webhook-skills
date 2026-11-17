# Setting Up Sent Webhooks

## Prerequisites

- A Sent account
- A publicly reachable `http://` or `https://` endpoint (URLs that resolve to private or loopback IP ranges are rejected). Use a tunnel such as `npx hookdeck-cli listen 3000 sent-dm --path /webhooks/sent-dm` while developing.

## Register Your Endpoint

1. Open [Webhooks in the Sent Dashboard](https://app.sent.dm/dashboard/webhooks) and click **Add Webhook**.
2. Choose the **Version** (**Version 2** is the default and recommended; **Version 1** is the legacy delivery), then fill in **Display Name**, **Endpoint URL** and **Select events to listen** (selecting a family reveals its sub-types, so you can subscribe to just `delivered` and `failed`).
3. Click **Add Webhook**.

Programmatically, call `POST /v3/webhooks` with the same fields plus `event_types` and optional `event_filters`. New webhooks are version 2; send `"webhook_version": 1` for the older delivery, which also accepts `retry_count` (1-5, default 3) and `timeout_seconds` (5-120, default 30). Example filter: `{"event_types": ["message", "templates"], "event_filters": {"message": ["delivered", "failed", "received"]}}`. To receive your Sender Profiles' events, set `is_inheritable: true` on a version 2 webhook, or add a `sender_profile` block to clone a version 1 webhook onto each profile.

## Get Your Signing Secret

The **Webhook Created** dialog shows the signing secret once when you save the webhook, so click **Copy** then. It starts with `whsec_`. Store it as `SENT_WEBHOOK_SECRET`. To get a new one, choose **Rotate signing secret** from the webhook's actions menu: a version 2 webhook is signed with both the old and new secret for 24 hours, and a version 1 webhook's old secret stops working at once. Version 1 clones on Sender Profiles use your webhook's secret, and rotating it updates every clone.

## Send a Test Delivery

From the webhook's actions menu choose **Test Webhook**, then click **Test** next to an event. Sent sends a sample payload for it to your endpoint. The delivery shows as `DELIVERED` in the webhook's **Events** table when your endpoint returned `2xx`. Test deliveries make a single attempt.

## Re-enable a Disabled Webhook

Sent turns a version 1 webhook off after 10 consecutive failed events, and a version 2 webhook when every delivery keeps failing for an hour after an event runs out of retries. Fix the endpoint, then re-enable the webhook in the dashboard.

## Test Mode vs Live Mode

Test deliveries come from **Test Webhook** and use the same signing scheme. Sent also has a sandbox mode for sends; see Sent's testing guide.
