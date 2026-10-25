# Setting Up Teamwork Webhooks

## Prerequisites

- A paid Teamwork.com plan (webhooks are not on free plans)
- Site administrator access (owner company) to enable webhooks, or project administrator access for project webhooks
- Your application's public webhook URL (use the Hookdeck CLI locally)

## Enable Webhooks

1. Go to your site **Settings** → **Webhooks** and toggle webhooks on. (Or use the Webhook endpoints in the Teamwork API.)

## Register Your Endpoint

- **Site level:** Settings → Webhooks → **Registered Events** → **Add Webhook**.
- **Project level:** Project settings → Webhooks → **Registered Events** → **Add Project Webhook**.

Then:

1. Choose **Version 2**. Only Version 2 webhooks sign requests.
2. Enter your endpoint URL.
3. Choose the events (e.g. `TASK.CREATED`, `TASK.COMPLETED`, `PROJECT.CREATED`, `COMMENT.CREATED`).
4. **Set a token.** The token is optional in Teamwork, but without one no `X-Projects-Signature` header is sent. Pick a long random string and store it as `TEAMWORK_WEBHOOK_TOKEN`.

## Hookdeck Setup

Only Teamwork.com Projects webhooks are supported (not Teamwork Desk or Spaces). Use Version 2 webhooks and set a token; Teamwork signs with it. Create a Hookdeck source of type Teamwork, enter the same token as the signing secret, and use the Hookdeck source URL as the webhook URL in Teamwork.

Locally:

```bash
npx hookdeck-cli listen 3000 teamwork --path /webhooks/teamwork
```

## Testing

Create or complete a task in a subscribed project and check the delivery arrives with `X-Projects-Event: TASK.CREATED` / `TASK.COMPLETED`. Add `fireWebhook=false` to API calls you don't want to trigger webhooks.
