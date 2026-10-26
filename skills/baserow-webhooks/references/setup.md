# Setting Up Baserow Webhooks

## Prerequisites

- A Baserow account (Cloud or self-hosted) with access to the table
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 baserow --path /webhooks/baserow` locally)

## Choose Your Secret

Baserow has no signing secret. Pick a long random value and store it as `BASEROW_WEBHOOK_SECRET`.
Decide the header name too (default in these examples: `Authorization`) and store it as
`BASEROW_WEBHOOK_HEADER`.

```bash
openssl rand -hex 32
```

## Register Your Endpoint

1. Click the **•••** menu beside your table or view and select **Webhooks**.
2. Click **Create webhook +**.
3. Enter a name, choose the **HTTP method** (GET, POST, PUT, PATCH or DELETE) and enter your URL
   (e.g. `https://example.com/webhooks/baserow`).
4. Select **Send everything**, or pick the events you want (rows created/updated/deleted, view and
   field events).
5. Under custom headers, add your header: the name from `BASEROW_WEBHOOK_HEADER` and, as the
   value, exactly what is in `BASEROW_WEBHOOK_SECRET`. If you type `Bearer abc123` as the value,
   the secret must be `Bearer abc123`; the endpoint compares the whole value.
6. Click **Trigger test webhook**, confirm your endpoint receives it and returns `200`, then **Save**.

## Using Hookdeck's Baserow Source

Hookdeck's Baserow source (type `BASEROW`) authenticates the same way: header name plus the exact
whole value. It pre-selects the `POST` method without managing it. If the Baserow webhook uses
PUT, PATCH, GET or DELETE, also allow that method on the source, otherwise those requests are
rejected.

## Test

```bash
curl -X POST http://localhost:3000/webhooks/baserow \
  -H "Content-Type: application/json" \
  -H "Authorization: $BASEROW_WEBHOOK_SECRET" \
  -d '{"event_type":"rows.created","event_id":"00000000-0000-0000-0000-000000000000","table_id":1,"items":[{"id":1}]}'
```

Use the **Call log** view in the webhook's details in Baserow to inspect request and response for
each delivery.

## Network Notes

Self-hosted instances may sit behind a firewall; make sure they can reach your endpoint. Always use
HTTPS so the secret header isn't sent in clear text.
