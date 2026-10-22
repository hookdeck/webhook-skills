# Setting Up Toggl Track Webhooks

Toggl webhooks are configured through the API (there is no dashboard form).

## Prerequisites

- A Toggl Track workspace (plan limits apply: Free allows 1 subscription)
- Your personal API token (Toggl Track profile page)
- A publicly reachable HTTPS endpoint that returns 2xx (use `npx hookdeck-cli listen 3000 toggl --path /webhooks/toggl` for local development)

All calls use HTTP Basic Auth: username = API token, password = `api_token` (`curl -u {api_token}:api_token`). Sending a `User-Agent` is recommended.

## Create a Subscription (and Get the Secret)

```bash
curl -u {api_token}:api_token -X POST \
  -H 'Content-Type: application/json' -H 'User-Agent: my-app' \
  -d '{
    "url_callback": "https://example.com/webhooks/toggl",
    "event_filters": [
      {"entity": "time_entry", "action": "*"},
      {"entity": "project", "action": "created"}
    ],
    "enabled": true,
    "secret": "choose-a-long-random-secret",
    "description": "My webhook"
  }' \
  https://api.track.toggl.com/webhooks/api/v1/subscriptions/{workspace_id}
```

- `secret` is optional; if omitted, Toggl generates one. This is what you put in `TOGGL_WEBHOOK_SECRET`.
- `description` must be unique within the workspace.
- `event_filters` needs at least one entry; `"*"` matches any entity or action.

## Validate the Subscription

Events are sent only when the subscription is **enabled and validated**. Choose one:

1. **Synchronous:** Toggl sends a PING with a `validation_code`; your endpoint responds with `{"validation_code": "<code>"}`. The example handlers do this.
2. **Asynchronous:** take the `validation_code` from the PING and call
   `GET https://api.track.toggl.com/webhooks/api/v1/validate/{workspace_id}/{subscription_id}/{validation_code}`. Use this when a proxy such as Hookdeck answers Toggl itself, so your handler's response never reaches Toggl.

## Send a Test PING

```bash
curl -u {api_token}:api_token -X POST \
  https://api.track.toggl.com/webhooks/api/v1/ping/{workspace_id}/{subscription_id}
```

PINGs are delivered even if the subscription is not yet enabled or validated.

## Other Operations

`GET .../subscriptions/{workspace_id}` lists subscriptions, `PUT` updates, `PATCH {"enabled": false}` disables, `DELETE` removes (all on `.../subscriptions/{workspace_id}/{subscription_id}`). A PUT's `secret` may not be empty.
