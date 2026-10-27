# Setting Up Featurebase Webhooks

## Prerequisites

- A Featurebase workspace on the Growth plan or higher
- A public `https://` endpoint that accepts `POST` with a JSON body and returns `200`, `201`, `202` or `204` within 5 seconds

## Get Your Signing Secret

1. Open **Settings → Developers → Webhooks** in your Featurebase dashboard.
2. Add the webhook (see below). Copy the signing secret. It starts with `whsec_`.
3. Store it as `FEATUREBASE_WEBHOOK_SECRET`.

Paste the whole secret, including the whsec_ prefix. Featurebase uses it as a plain HMAC key.

Each webhook has its own secret. You can create webhooks and refresh a webhook's secret with the API too: [create webhook](https://help.featurebase.app/api-reference/webhooks-api/create-webhook), [refresh webhook secret](https://help.featurebase.app/api-reference/webhooks-api/refresh-webhook-secret).

## Register Your Endpoint

1. In **Settings → Developers → Webhooks**, add your endpoint URL.
2. Select the topics you want, for example `post.created`, `post.updated`, `comment.created`, `ticket.created`, `changelog.published` and `conversation.user.created`.
3. Save. Create a Request or comment to trigger a delivery.

The API also lets you add custom headers and set a timeout of up to 30 seconds. A workspace can have up to 10 webhooks.

For local development, run `npx hookdeck-cli listen 3000 featurebase --path /webhooks/featurebase` (use port 8000 for FastAPI) and register the printed URL.

## Hookdeck Setup

Create a source of type **Featurebase** in Hookdeck and paste the signing secret. Paste the whole secret, including the whsec_ prefix. Featurebase uses it as a plain HMAC key. Hookdeck verifies the signature and forwards the request to your destination, retrying failures.

## Webhook Health

A webhook is paused after 100 consecutive failures and disabled after 500 failures or 3 pauses in 24 hours. Events sent while it is paused or disabled are not kept, so monitor your endpoint and put a queue or the Hookdeck Event Gateway in front of it.

## Test Mode vs Live Mode

Featurebase has no separate test mode. Use a test workspace or create a Request on a private board to trigger deliveries.
