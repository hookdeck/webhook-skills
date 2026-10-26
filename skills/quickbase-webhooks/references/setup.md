# Setting Up Quickbase Webhooks

## Prerequisites

- A Quickbase app where you can manage webhooks (app admin)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 quickbase --path /webhooks/quickbase` locally)

## Choose a Secret

Quickbase does not generate a secret. Pick a long random value dedicated to this webhook and store
it as `QUICKBASE_WEBHOOK_SECRET`. Choose the header name too (`Authorization` is the default the
examples assume) and store it as `QUICKBASE_WEBHOOK_HEADER` if it is not `Authorization`.

The secret is the **exact, whole header value**. If you type `Bearer abc123` as the value, set
`QUICKBASE_WEBHOOK_SECRET=Bearer abc123`; the handler does not strip or parse `Bearer `.

## Register Your Endpoint

1. Open the app, go to the table's settings and create a webhook (name and description).
2. Under **When**, pick any of: record added, modified, deleted. Optionally use **Additional
   criteria** to filter on changed fields or field values.
3. Under **Then**, set:
   - **Endpoint URL**: your `https://` URL, e.g. `https://example.com/webhooks/quickbase`
   - **HTTP method**: POST (default) is fine; the examples also accept PUT, PATCH, GET and DELETE
   - **Message format**: JSON for the examples (XML and RAW are accepted too)
   - **Message header**: add `Content-Type: application/json` and your secret header, e.g.
     `Authorization: Bearer abc123` (up to 10 pairs)
   - **Message body**: your template, e.g. `{ "event": "record_added", "record_id": <field reference> }`
4. Save.

Webhooks can be edited or copied by all admins in the app, so any credential you enter is visible
to them.

## Hookdeck Source

If you receive through Hookdeck's Quickbase source (type `QUICKBASE`), set the source's
verification to the same header name and exact whole value. The source pre-selects `POST` without
managing the method, so if the webhook uses PUT, PATCH, GET or DELETE, allow that method on the
source too.

## Test

Add or edit a record in the table, or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/quickbase \
  -H "Content-Type: application/json" \
  -H "Authorization: $QUICKBASE_WEBHOOK_SECRET" \
  -d '{"event":"record_added","record_id":42,"table":"Projects"}'
```
