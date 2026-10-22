# Setting Up Loop Returns Webhooks

## Prerequisites

- A Loop Returns account with access to the Loop Admin's Developer Tools page
- Your application's public webhook endpoint URL (for local work, use the Hookdeck CLI below)
- For the API route: a Loop API key with the `Developer Tools` scope

## Get Your Webhook Secret

1. Sign in to the [Loop Admin](https://admin.loopreturns.com/settings/developers) and open **Settings → Developer Tools**.
2. Copy the webhook secret shown on that page. It is the same page where you create subscriptions.
3. Store it as `LOOP_WEBHOOK_SECRET`.

## Register Your Endpoint

In the Loop Admin:

1. On **Developer Tools**, create a webhook.
2. Select a **topic** (Return, Label, ...) and a **trigger** (`return.created`, `label.created`, ...).
3. Enter your endpoint URL, for example `https://your.app/webhooks/loop-returns`.

Recommended starting point: topic **Return** with triggers `return.created`, `return.updated` and `return.closed`, plus topic **Label** with `label.created` and `label.updated` if you track shipments.

A webhook is **Active** (sending payloads) or **Inactive** (manually deactivated, sends nothing).

Or use the [Programmatic Webhook API](https://docs.loopreturns.com/api-reference/latest/programmatic-webhooks/create-webhook) to create, update, list and delete subscriptions.

## Local Development

```bash
npx hookdeck-cli listen 3000 loop-returns --path /webhooks/loop-returns
```

Use the printed URL as the webhook URL in Loop. To preview a payload without writing code, point a subscription at a [webhook.site](https://webhook.site) URL first.

## Testing

Loop's docs don't describe a webhook test button. Trigger a real event, such as submitting a test return in your returns portal, and watch the request arrive.
