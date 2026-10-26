# Setting Up Aimfox Webhooks

## Prerequisites

- An Aimfox workspace
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 aimfox --path /webhooks/aimfox` locally)

## Choose Your Credential

Aimfox sends no signature. Decide on a secret header the endpoint will require:

- **Bearer token**: header `Authorization`, value `Bearer <long-random-string>`
- **Custom header**: for example `X-Aimfox-Secret` with value `<long-random-string>`
- **Basic**: header `Authorization`, value `Basic <base64(user:password)>`; Aimfox's docs point to
  a Basic auth header generator

Store the header name as `AIMFOX_WEBHOOK_HEADER` (default `Authorization`) and the **exact whole
value, including any `Bearer ` or `Basic ` prefix**, as `AIMFOX_WEBHOOK_SECRET`.

## Register Your Endpoint

1. In Aimfox open **Workspace settings** and switch to the **Webhooks** tab.
2. Click **Add webhook**.
3. Enter a **Name** and your **URL** (e.g. `https://example.com/webhooks/aimfox`).
4. In **Authentication Header**, enter the header and value you chose above.
5. Pick the events to receive from the dropdown (one webhook can subscribe to several).
6. Click **Save**.

Via the API, `POST /api/v3/webhooks` creates a webhook and `PATCH /api/v3/webhooks/:webhook_id`
accepts a free-form `headers` object, e.g. `{"Authorization": "Bearer 123"}`. These routes need a
normal API key.

## Test

```bash
curl -X POST http://localhost:3000/webhooks/aimfox \
  -H "Content-Type: application/json" \
  -H "Authorization: $AIMFOX_WEBHOOK_SECRET" \
  -d '{"id":"evt_1","event_type":"new_connection","event":{},"workspace":{"id":"w1"}}'
```

Use your configured header name instead of `Authorization` if you chose a custom one.

## Network Notes

Don't rely on source IPs. Authenticate with the header, serve the endpoint over HTTPS, and rotate
the credential (update it in Aimfox and in your environment together) if it leaks.
