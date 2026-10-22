# Setting Up SavvyCal Webhooks

## Prerequisites

- A SavvyCal account with access to Settings > Integrations
- Your application's public webhook endpoint URL (use the Hookdeck CLI for local development)

## Register Your Endpoint

### Via the user interface

1. In SavvyCal, go to **Settings > Integrations**.
2. Click the **+** icon in the Webhooks section.
3. Enter your endpoint URL (for example `https://yourapp.com/webhooks/savvycal`).
4. Select the events you want to receive.

### Via the REST API

See the Webhooks section of the [SavvyCal API reference](https://developers.savvycal.com) for creating and managing webhooks programmatically.

## Get Your Signing Secret

Each webhook has its own secret. It is shown alongside the webhook's configuration in your account's integration settings (there is a button to copy it to the clipboard). Store it as `SAVVYCAL_WEBHOOK_SECRET`.

## Recommended Events

`event.created`, `event.rescheduled`, `event.canceled`, `event.changed`. Add `event.checkout.completed` (and `event.checkout.pending` / `event.checkout.expired`) if you sell paid events, and `event.requested` / `event.approved` / `event.declined` if you use approval.

## Test Locally

```bash
npx hookdeck-cli listen 3000 savvycal --path /webhooks/savvycal
```

Use the tunnel URL as the webhook URL, then book or cancel a meeting on one of your scheduling links.

## Delivery

Respond with `200 OK` quickly and enqueue work. Non-2xx responses are retried with exponential backoff, so make handlers idempotent (the payload `id` is a convenient dedupe key).
