# Setting Up MaintainX Webhooks

## Prerequisites

- A MaintainX account with permission to manage integrations
- A publicly reachable HTTPS endpoint (up to 512 characters). For local development use `npx hookdeck-cli listen 3000 maintainx --path /webhooks/maintainx`

## Create a Webhook in the Web App

1. In the sidebar, select **Settings**, then **Integrations**.
2. Open the **Webhooks** tab and select **+ New Webhook**.
3. In **Trigger Webhook On**, pick the event (for example `NEW_WORK_ORDER`).
4. In **Endpoint**, enter your URL, for example `https://your-domain.com/webhooks/maintainx`.
5. Save.

Each webhook subscribes to a single event type, so create one per event you need (they can share a URL).

## Get Your Signing Secret

In **Settings > Integrations**, find the webhook, and select **Copy secret**. Store it as `MAINTAINX_WEBHOOK_SECRET`. Use it as a raw string (don't base64-decode it).

Via the REST API: `POST /subscriptions` creates a webhook, and `GET /subscriptions/{id}/secret` returns its secret. Also `PATCH` and `DELETE` on `/subscriptions/{id}`.

## Request Headers

| Header | Value |
|--------|-------|
| `x-maintainx-webhook-body-signature` | `t=<unix>,v1=<hex>` over the raw body |
| `x-maintainx-webhook-uri-signature` | `t=<unix>,v1=<hex>` over the full URI (optional extra) |

## Delivery Behavior

- Calls time out after 10 seconds: return `2xx` quickly and process asynchronously
- Webhooks that don't get a successful response over long periods may be deleted
- There is no separate test mode; trigger a real event (such as creating a work order) to test
