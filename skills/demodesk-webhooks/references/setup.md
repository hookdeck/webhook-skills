# Setting Up Demodesk Webhooks

## Prerequisites

- A Demodesk account on a plan that includes the Demodesk API (the section stays locked otherwise)
- Company admin rights (only admins can create, edit or delete webhook endpoints)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 demodesk --path /webhooks/demodesk` locally)

## Choose Your Secret

Demodesk does not generate a signing secret. You invent one: a long random string, used as the
value of a custom header.

```bash
openssl rand -hex 32
```

Store the header name and the exact value you will type into Demodesk:

```bash
DEMODESK_WEBHOOK_HEADER=Authorization
DEMODESK_WEBHOOK_SECRET="Bearer <the random string>"
```

`DEMODESK_WEBHOOK_SECRET` is the **whole** header value, including `Bearer ` if you type it.

## Register Your Endpoint

1. Go to **Settings > Integrations > Connections** and scroll to the **Demodesk API** section.
2. In the **Webhooks** area, click **Webhook**.
3. Enter the **Webhook URL** (e.g. `https://example.com/webhooks/demodesk`).
4. Select the **event** to subscribe to. An endpoint takes one event, so add one endpoint per
   event, each with the same custom header.
5. Add a **custom header**: the name (for example `Authorization`) and the value from above.
   Names must be unique per endpoint, and `Content-Type`, `Content-Length` and `Host` are reserved.
6. Click **Add endpoint**.

The list shows each endpoint's status: **Healthy**, **Failing** or **Disabled**. An endpoint that
keeps failing is disabled after too many failed attempts.

## Test

Replay a request with curl:

```bash
curl -X POST http://localhost:3000/webhooks/demodesk \
  -H "Content-Type: application/json" \
  -H "$DEMODESK_WEBHOOK_HEADER: $DEMODESK_WEBHOOK_SECRET" \
  -d '{"meta":{"event":{"action":"demo.scheduled"}},"data":{}}'
```

## Rotating the Credential

Edit the webhook in Demodesk (**Edit webhook** > headers > **Save changes**) and update
`DEMODESK_WEBHOOK_SECRET` at the same time, on every endpoint that uses it.
