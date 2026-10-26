# Setting Up Openlayer Webhooks

## Prerequisites

- An Openlayer workspace where you are a **workspace admin** (only admins can create and manage webhooks)
- Your application's public HTTPS webhook URL (use the Hookdeck CLI for local development)

## How Do I Register a Webhook Endpoint?

Webhook subscriptions are managed per workspace. Each one has an HTTPS URL and one or more event types.

**Dashboard:** click the workspace name in the upper-left corner, choose **Workspace Settings**, open **Webhooks**, and add a webhook with:

- **URL**: the HTTPS endpoint that receives events
- **Event types**: one or more of `test.created`, `test.updated`, `test.deleted`, `tests.result.updated`
- **Description**: optional label

New subscriptions are enabled by default.

**API:** authenticate with an API key as a bearer token against `https://api.openlayer.com/v1`:

```bash
curl -X POST "https://api.openlayer.com/v1/workspaces/{workspaceId}/webhooks" \
  -H "Authorization: Bearer $OPENLAYER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/openlayer",
    "description": "Production alerting",
    "eventTypes": ["test.created", "tests.result.updated"]
  }'
```

`url` (max 2048 characters) and `eventTypes` are required; `description` (max 500) and `enabled` (default `true`) are optional. Other calls: `GET` (list), `GET .../{webhookId}`, `PUT .../{webhookId}` (change URL, event types, description or `enabled`), `DELETE .../{webhookId}` and `GET .../{webhookId}/deliveries`. Openlayer does not send a challenge request when you create a subscription.

## Where Is My Signing Secret?

The create response (and the dashboard right after creation) shows the secret **once**:

```json
{ "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6", "secret": "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw" }
```

It cannot be retrieved later and is never included when listing or retrieving subscriptions. If you lose it, delete the subscription and create a new one. Store the full value, prefix included, in `OPENLAYER_WEBHOOK_SECRET`.

## How Do I Test an Endpoint?

Openlayer documents no "send test event" action, so trigger a subscribed event, for example by creating or editing a test in a project. The **Deliveries** tab (or the deliveries endpoint) shows each attempt's status, HTTP status code, response time and response body or error.

To reach a handler on your machine, start a tunnel and register its URL as a normal subscription:

```bash
# Express / Next.js (use 8000 for FastAPI). No install or account required.
npx hookdeck-cli listen 3000 openlayer --path /webhooks/openlayer
```

## What Happens When My Endpoint Is Down?

Return any `2xx`. The connection timeout is 5 seconds and the response timeout 10 seconds; redirects are not followed. After a failed attempt Openlayer retries up to 3 times after about 5 seconds, 5 minutes and 30 minutes (up to 10% jitter), then marks the event `failed` and does not deliver it again. Events and delivery records are kept for 90 days. Setting `enabled` to `false` pauses deliveries without deleting the subscription.
