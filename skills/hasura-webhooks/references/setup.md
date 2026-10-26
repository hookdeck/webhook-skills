# Setting Up Hasura Event Trigger Webhooks

## Prerequisites

- A Hasura v2 project with a Postgres or MS SQL Server database (Hasura DDN v3 is not covered)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 hasura --path /webhooks/hasura` locally)

## Choose a Secret Header

Hasura doesn't sign Event Trigger requests, so you add your own secret header:

1. Pick a header name, e.g. `Authorization` or `X-Webhook-Secret`.
2. Generate a long random value, e.g. `openssl rand -hex 32`.
3. Store the header name as `HASURA_WEBHOOK_HEADER` (default `Authorization`) and the **exact
   whole value** as `HASURA_WEBHOOK_SECRET`. If you type `Bearer abc123` as the value, the secret
   is `Bearer abc123`, prefix included.

## Create the Event Trigger

In the Hasura Console, open **Events**, click **Create**, then:

1. Enter a trigger name, pick the schema and table, and select the operations (insert, update,
   delete, and "Invoke via console" for manual).
2. Set **Webhook URL** to your endpoint, e.g. `https://example.com/webhooks/hasura`. It must be a
   POST handler and can come from an environment variable.
3. Expand **Advanced Settings > Headers** and add your header. Type **static** sends the value as
   typed; **from env variable** takes the name of an environment variable in the Hasura engine,
   which is resolved before sending (keeps the secret out of metadata).
4. Optionally set the retry configuration (`num_retries`, `interval_sec`, `timeout_sec`).

Or via metadata:

```yaml
event_triggers:
  - name: insert_user
    definition:
      enable_manual: true
      insert:
        columns: "*"
    webhook: https://example.com/webhooks/hasura
    headers:
      - name: Authorization
        value_from_env: HASURA_EVENT_WEBHOOK_SECRET
```

## Test

Use the trigger's manual invoke (set `enable_manual: true`) to send a `MANUAL` event, or insert a
row. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/hasura \
  -H "Content-Type: application/json" \
  -H "Authorization: $HASURA_WEBHOOK_SECRET" \
  -d '{"event":{"op":"INSERT","data":{"old":null,"new":{"id":1}},"session_variables":{},"trace_context":{}},"id":"123e4567-e89b-12d3-a456-426614174000","created_at":"2020-07-29T10:00:00.000Z","delivery_info":{"current_retry":0,"max_retries":0},"trigger":{"name":"insert_user"},"table":{"schema":"public","name":"users"}}'
```

## Network Notes

If Hasura runs in Docker, make sure the container can reach your webhook URL.
