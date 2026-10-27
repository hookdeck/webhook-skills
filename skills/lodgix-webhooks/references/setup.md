# Setting Up Lodgix Webhooks

## Prerequisites

- A Lodgix account with access to **Modules > Integrations**
- A publicly reachable `https://` endpoint (Lodgix requires HTTPS). For local
  development use `npx hookdeck-cli listen 3000 lodgix --path /webhooks/lodgix`

## Create a Webhook Endpoint

1. Go to **Modules > Integrations > Webhooks**.
2. Click **Create Webhook** (or **Add Endpoint** if you already have one).
3. Enter a **Name** so you can recognize it later (for example "n8n Webhook").
4. Enter the **Endpoint URL**. It must start with `https://`; Lodgix will `POST` to it.
5. Select the event to receive. `message.received` (fired when a guest message is
   received) is currently the only option.
6. Click **Create Endpoint**.

## Get Your Signing Secret

Every request is signed with the **secret from your endpoint**. Store it as
`LODGIX_WEBHOOK_SECRET` and use it as-is (the UTF-8 string, not decoded).
Lodgix's article does not describe where the secret is displayed, so check the
endpoint's card in the Webhooks page after creating it.

## Optional: Replay Window

Set `LODGIX_WEBHOOK_TOLERANCE_SECONDS` (for example `300`) to reject requests whose
`X-Lodgix-Timestamp` is older than that many seconds. Leave it unset or `0` when
Hookdeck or another proxy may retry or replay deliveries.

## Re-enabling a Failing Endpoint

An endpoint that keeps failing can be disabled automatically. Fix the handler, then
use **Re-enable** on the endpoint card.

## Testing

Lodgix's article documents no test-send button. Trigger a real `message.received`
event by receiving a guest message, and inspect the delivery in the Lodgix delivery
log or the Hookdeck CLI web UI.
