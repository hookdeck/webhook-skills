# Setting Up a Tray.io Workflow to Call Your Endpoint

## Prerequisites

- A Tray.io (tray.ai) account and a workflow
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 tray-io --path /webhooks/tray-io` locally)

## Create the Credential

1. Choose a long random value, for example `openssl rand -hex 32`.
2. In Tray, create a **Generic Service Authentication** and store the value in one of its fields
   (for example `api_key`). Tray's docs say never to hard-code authentication values in the
   properties panel; reference the auth with `$.auth` so the value is obscured in logs.
3. Store the same value on your server as `TRAY_IO_WEBHOOK_SECRET`.

## Configure the HTTP Client Step

1. Add an **HTTP Client** step to the workflow and select the authentication from step 2.
2. Set the URL (for example `https://example.com/webhooks/tray-io`) and the method.
3. Add a header. The name is your choice; the value references the auth, for example
   `Authorization` = `$.auth.api_key` (or `Bearer ` followed by `$.auth.api_key`).
4. Set `TRAY_IO_WEBHOOK_HEADER` to the header name and `TRAY_IO_WEBHOOK_SECRET` to the **exact whole
   header value** your workflow sends, including any `Bearer ` prefix.
5. Set the body type to JSON. The body is yours to define; to match the examples, include an
   `event` field (a convention of this skill, not a Tray field), for example
   `{"event": "record.created", "data": {...}}`.

## Test

Run the workflow with a manual trigger and check your endpoint's logs. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/tray-io \
  -H "Content-Type: application/json" \
  -H "Authorization: $TRAY_IO_WEBHOOK_SECRET" \
  -d '{"event":"record.created","data":{"id":"rec_123"}}'
```

## Rotating the Credential

Update the Generic Service Authentication in Tray and `TRAY_IO_WEBHOOK_SECRET` on your server at the
same time, or requests will fail with 401 in between.
