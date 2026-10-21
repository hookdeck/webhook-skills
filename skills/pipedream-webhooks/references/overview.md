# Pipedream Webhooks Overview

## What Are Pipedream Connect Webhooks?

[Pipedream Connect](https://pipedream.com/docs/connect) lets you embed Pipedream's integrations (managed auth, actions and triggers for thousands of apps) in your own product. Connect sends two categories of webhooks to your server:

- **Connection webhooks** notify you when an end user connects, or fails to connect, an account. You set the URL as `webhook_uri` when you [create a Connect token](https://pipedream.com/docs/connect/api-reference/create-connect-token).
- **Trigger webhooks** deliver the events emitted by [deployed triggers](https://pipedream.com/docs/connect/components/triggers). You set the URL per trigger (`webhook_url` on deploy) or as a project-level default per environment. If both are set, the trigger-level URL takes precedence.

Both arrive as `POST` requests with a JSON body.

## Which Pipedream Webhooks Are Signed?

| Webhook | Signed? |
|---------|---------|
| Trigger webhooks | Yes, with `x-pd-signature` (see [verification.md](verification.md)) |
| Connection webhooks (`CONNECTION_SUCCESS`, `CONNECTION_ERROR`) | Not documented as signed |
| Plain workflow HTTP requests (outside Connect) | Not documented as signed |

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `CONNECTION_SUCCESS` | An end user successfully connected their account | Store `account.id` against your user (`account.external_id`), mark the integration active, fetch credentials via Retrieve Account |
| `CONNECTION_ERROR` | An error occurred during the connection flow | Show the user a retry prompt, log `error` |
| Trigger event | A deployed trigger emitted an event | Sync the upstream app's data (new issue, new row, new message...) into your product |

Trigger webhooks have **no Pipedream event type name**: the body is the event the trigger's component emitted, so its shape is defined by that trigger (for example `gitlab-new-issue` emits a GitLab issue). Use a distinct `webhook_url` per trigger, or track which deployed trigger (`dc_…`) you pointed at which URL, to know how to parse it.

## Event Payload Structure

### CONNECTION_SUCCESS

User credentials are **not** included. Call [Retrieve Account](https://pipedream.com/docs/connect/api-reference/retrieve-account) with `account.id` to fetch them.

```json
{
  "event": "CONNECTION_SUCCESS",
  "connect_token": "ctok_xxxxxxx",
  "environment": "production",
  "connect_session_id": 1.4058728083872854e+38,
  "account": {
    "id": "apn_xxxxxxx",
    "name": "jane@example.com",
    "external_id": "user-abc-123",
    "healthy": true,
    "dead": null,
    "app": {
      "id": "oa_xxxxxxx",
      "name_slug": "google_sheets",
      "name": "Google Sheets",
      "auth_type": "oauth"
    },
    "created_at": "2026-03-25T17:49:15.000Z",
    "updated_at": "2026-03-25T17:49:15.000Z"
  }
}
```

(`account.app` also carries `description`, `img_src`, `custom_fields_json`, `categories`, `featured_weight` and a `connect` block.)

### CONNECTION_ERROR

```json
{
  "event": "CONNECTION_ERROR",
  "connect_token": "ctok_xxxxxxx",
  "environment": "production",
  "connect_session_id": 1.4058727315359677e+38,
  "error": "Test request failed. Please verify your credentials and try again."
}
```

`connect_session_id` is a very large number; parse it as a float (or keep the raw string) rather than an integer type.

### Trigger events

The body is the trigger's emitted event. To see real shapes before wiring a handler, call [List trigger events](https://pipedream.com/docs/connect/api-reference/list-trigger-events) for the deployed trigger, or let the trigger emit its historical sample events on deploy (the default; pass `emit_on_deploy: false` to turn it off).

## Full Event Reference

- [Pipedream Connect webhooks](https://pipedream.com/docs/connect/webhooks)
- [Deploying triggers](https://pipedream.com/docs/connect/components/triggers)
