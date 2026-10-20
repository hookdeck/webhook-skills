# Setting Up ClickUp Webhooks

ClickUp API webhooks are created with the API, not in the ClickUp UI. The signing secret is only available from the API response.

## Prerequisites

- A ClickUp Workspace you belong to
- A ClickUp API token: a personal token (`pk_...`, from **Settings → Apps**) or an OAuth access token for your app
- Your Workspace ID (`team_id`): call `GET https://api.clickup.com/api/v2/team`
- A public HTTPS URL for your webhook endpoint (for local development, use the Hookdeck CLI below)

## How Do I Get a Public URL for Local Development?

```bash
npx hookdeck-cli listen 3000 clickup --path /webhooks/clickup
```

Use `8000` instead of `3000` for the FastAPI example. The CLI prints a public URL that forwards to `http://localhost:3000/webhooks/clickup`. No account is required.

## How Do I Create a ClickUp Webhook?

```bash
curl -X POST "https://api.clickup.com/api/v2/team/$CLICKUP_TEAM_ID/webhook" \
  -H "Authorization: $CLICKUP_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "https://your-hookdeck-or-app-url/webhooks/clickup",
    "events": ["taskCreated", "taskUpdated", "taskStatusUpdated", "taskCommentPosted"],
    "list_id": 4567
  }'
```

- `events`: one or more event names, or `["*"]` for all events
- Location filter (optional): `space_id`, `folder_id`, `list_id`, or `task_id`. Only one per hierarchy level; the most specific one applies.
- Use `https`. ClickUp warns that non-SSL endpoints may stop being supported.

## Where Do I Get the Signing Secret?

The response contains the secret:

```json
{
  "id": "4b67ac88-e506-4a29-9d42-26e504e3435e",
  "webhook": {
    "id": "4b67ac88-e506-4a29-9d42-26e504e3435e",
    "endpoint": "https://your-hookdeck-or-app-url/webhooks/clickup",
    "events": ["taskCreated", "taskUpdated", "taskStatusUpdated", "taskCommentPosted"],
    "health": { "status": "active", "fail_count": 0 },
    "secret": "O94IM25S7PXBPYTMNXLLET230SRP0S89COR7B1YOJ2ZIE8WQNK5UUKEF26W0Z5GA"
  }
}
```

Store `webhook.secret` as `CLICKUP_WEBHOOK_SECRET`:

```bash
CLICKUP_WEBHOOK_SECRET=O94IM25S7PXBPYTMNXLLET230SRP0S89COR7B1YOJ2ZIE8WQNK5UUKEF26W0Z5GA
```

If you lose it, `GET /api/v2/team/{team_id}/webhook` lists the webhooks you created, including each `secret`.

Every webhook has its own secret. If you create several webhooks pointing at one endpoint, keep a map of `webhook_id → secret` (see [verification.md](verification.md)).

## How Do I Manage Existing Webhooks?

| Action | Endpoint |
|--------|----------|
| List webhooks you created | `GET /api/v2/team/{team_id}/webhook` |
| Change events, endpoint, or status | `PUT /api/v2/webhook/{webhook_id}` |
| Delete a webhook | `DELETE /api/v2/webhook/{webhook_id}` |

To reactivate a suspended webhook:

```bash
curl -X PUT "https://api.clickup.com/api/v2/webhook/$WEBHOOK_ID" \
  -H "Authorization: $CLICKUP_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"endpoint": "https://your-app/webhooks/clickup", "events": ["*"], "status": "active"}'
```

## How Do I Test?

ClickUp has no "send test event" button or test mode. Create the webhook against a test List or Space, then create, update, or comment on a task there. Each action sends a real, signed event.

## Can I Allowlist ClickUp's IP Addresses?

No. ClickUp doesn't send webhooks from dedicated IP addresses. Rely on the `X-Signature` check.

## Automation "Call webhook" Action

ClickUp Automations can also call a URL ("Call webhook" action). That is a separate feature with a different payload (`auto_id`, `trigger_id`, `payload`). ClickUp's signature documentation covers webhooks created via the API; this skill targets those.
