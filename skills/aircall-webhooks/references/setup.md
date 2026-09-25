# Setting Up Aircall Webhooks

## Prerequisites

- An Aircall account (admin access to create webhooks from the Dashboard)
- API credentials — an **API ID / API Token** pair, or an OAuth2 application
- A **publicly reachable HTTPS endpoint** with a valid SSL certificate

> Your webhook URL must start with `https`. Plain HTTP is not supported.

## Two Ways to Create a Webhook

### Option 1: Public API (recommended for integrations)

`POST https://api.aircall.io/v1/webhooks`

Authenticate with either:

- **Basic Auth** — `api_id:api_token`
- **OAuth2** — `Authorization: Bearer <access_token>`

**These API credentials are a different secret from the webhook token.** The API
credential manages webhooks; the webhook token verifies incoming events.

Body params:

| Param | Type | Notes |
|-------|------|-------|
| `url` | String | **Mandatory.** Must be a valid HTTPS URL |
| `custom_name` | String | Human-readable label |
| `events` | Array | Events to subscribe to. **If omitted or empty, ALL events are attached.** |

```bash
curl -X POST https://api.aircall.io/v1/webhooks \
  -u "$AIRCALL_API_ID:$AIRCALL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "custom_name": "My Custom Workflow",
    "url": "https://my-server.example.com/webhooks/aircall",
    "events": ["call.created", "call.answered", "call.ended"]
  }'
```

Response — `201 Created`:

```json
{
  "webhook": {
    "webhook_id": "c2501111-8a69-4342-bb34-bcd6cfe564ab",
    "direct_link": "https://api.aircall.io/v1/webhooks/26316",
    "created_at": "2020-03-24T19:51:24.000Z",
    "url": "https://my-server.example.com/webhooks/aircall",
    "active": true,
    "events": ["call.created", "call.answered", "call.ended"],
    "token": "df76g76dpziygs567f0"
  }
}
```

**Store `webhook.token`** as `AIRCALL_WEBHOOK_TOKEN`. This is the value you compare
against the `token` field in every incoming payload.

Other response codes: `400` (missing `url`, over the 100-webhook limit, or invalid
events), `403` (invalid API key or Bearer token).

### Option 2: Aircall Dashboard

1. Log in to your Aircall account.
2. Go to the **Integrations** page (*Integrations & API* section).
3. Search for "Webhook" and click the **Webhook** integration under *All Integrations*.
4. Click **Install Integration**.
5. Provide a name and a valid HTTPS URL, and select the events to subscribe to.
6. Click **Add Webhook**.

Aircall starts sending events immediately after creation, so have your server running
first.

The Dashboard flow does **not** display the token. Retrieve it via the API:

```bash
curl https://api.aircall.io/v1/webhooks/{webhook_id} \
  -u "$AIRCALL_API_ID:$AIRCALL_API_TOKEN"
```

```json
{
  "webhook": {
    "webhook_id": "c2501111-8a69-4342-bb34-bcd6cfe564ab",
    "url": "https://my-server.example.com/webhooks/aircall",
    "active": true,
    "token": "abc123def456ghi789",
    "events": ["call.assigned", "call.transferred", "call.ringing_on_agent"]
  }
}
```

## Managing Webhooks

| Operation | Request |
|-----------|---------|
| List | `GET /v1/webhooks` (paginated; `order` = `asc`/`desc`) |
| Retrieve | `GET /v1/webhooks/{webhook_id}` |
| Create | `POST /v1/webhooks` |
| Update | `PUT /v1/webhooks/{webhook_id}` |
| Delete | `DELETE /v1/webhooks/{webhook_id}` |

`webhook_id` is a UUID. An old numeric webhook "Id" can still be used to retrieve the new
UUID.

### Updating events without clobbering the list

On update, **if `events` is not specified, the webhook is registered to all events by
default.** To add or remove specific events instead of replacing the list, pass the
`events_action` query param:

```bash
# Add events to the existing list
curl -X PUT "https://api.aircall.io/v1/webhooks/{webhook_id}?events_action=add" \
  -u "$AIRCALL_API_ID:$AIRCALL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"events": ["call.tagged"]}'

# Remove events from the existing list
curl -X PUT "https://api.aircall.io/v1/webhooks/{webhook_id}?events_action=remove" \
  -u "$AIRCALL_API_ID:$AIRCALL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"events": ["call.tagged"]}'
```

The update endpoint is also how you **re-activate a webhook that Aircall automatically
disabled**.

## Requirements for Your Server

- Accepts **POST** requests and reads JSON
- Always answers **200**
- Responds within **5 seconds** (Aircall's request timeout)
- Publicly available over HTTPS with a valid certificate

## Automatic Deactivation — and How to Avoid It

A request is failed if your server responds outside the 2xx range **or** times out.

1. Aircall retries a failed event up to **50 times**. (Its docs also say "50 consecutive
   failures" and, in an older tutorial, "10 failed requests", so don't budget on 50.)
2. If the problem persists, the webhook is **automatically disabled** and a notification
   appears on the Dashboard.
3. Once disabled, Aircall keeps retrying the failed events for up to **12 hours**.
4. A successful response during that window **automatically re-enables** the webhook.

Admins can enable email notifications for disable/re-enable events under **User Settings**
in the Aircall Dashboard.

The practical defense: return 200 as the very first thing your handler does after
verifying the token, and push the work onto a queue.

## Local Development

Aircall requires a public HTTPS URL, so you need a tunnel. Use the Hookdeck CLI — no
account and no install required:

```bash
npx hookdeck-cli listen 3000 aircall --path /webhooks/aircall
```

For FastAPI, use port `8000`:

```bash
npx hookdeck-cli listen 8000 aircall --path /webhooks/aircall
```

Paste the printed public URL into the `url` field when creating the webhook (or into the
Dashboard's URL field). The CLI also gives you a web UI for inspecting and replaying
requests.

Aircall's own docs suggest ngrok for SSH tunnels; either works, but the Hookdeck CLI adds
request inspection and replay, which is useful given Aircall's unordered at-least-once
delivery.

## Testing

There is no "test mode" or test-event button in Aircall. To generate real events, place a
call to one of your Aircall numbers, or trigger a contact/number change on the account.

To exercise your handler without Aircall, POST a payload yourself — the token is just a
body field:

```bash
curl -X POST http://localhost:3000/webhooks/aircall \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "call",
    "event": "call.created",
    "timestamp": 1732622896,
    "token": "'"$AIRCALL_WEBHOOK_TOKEN"'",
    "data": { "id": 123, "direction": "inbound", "status": "initial" }
  }'
```

## Environment Variables

```bash
AIRCALL_WEBHOOK_TOKEN=df76g76dpziygs567f0   # webhook.token — verifies incoming events

# Only needed to manage webhooks via the API (not for receiving them):
AIRCALL_API_ID=your_api_id
AIRCALL_API_TOKEN=your_api_token
```

## Limits

- Up to **100 webhooks** per company.
- With **OAuth** integrations, admins can filter which numbers send call events. With
  **Basic Auth**, call events are sent for all numbers of the company.
