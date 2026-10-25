# Setting Up RapidAPI Webhooks

Covers Enterprise Hub events only. This is not available on the public rapidapi.com marketplace.

## Prerequisites

- A RapidAPI Enterprise Hub with access to the **Admin Panel**
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 rapidapi --path /webhooks/rapidapi` locally)

## Get Your Secret Key

1. Open the **Events** tab of the Admin Panel.
2. Copy the webhook secret key and store it as `RAPIDAPI_WEBHOOK_SECRET`.
3. **Generate new** creates a replacement key. Update `RAPIDAPI_WEBHOOK_SECRET` at the same time
   or every event will start failing with 401.

RapidAPI sends this key in the `x-rapidapi-webhook-secret` header of every webhook request.

## Register Your Endpoint

1. On the **Events** tab, slide **Enable event triggers** to the right.
2. Under **Callback URL (up to 5)**, click **Add a URL** and enter your endpoint, for example
   `https://example.com/webhooks/rapidapi`. Each URL receives every event.
3. Click **Save**. You must add a callback URL to begin seeing events in the event logs, even a
   temporary one.

## Test

Click **Test event** next to an event, pick a **Test URL** and send it. The dialog shows the
request RapidAPI sent and your response, which is also how you obtain a real sample body (the
format isn't documented). Set `RAPIDAPI_EVENT_FIELD` to the field that carries the event type.
Past deliveries appear under **Event logs**.

Or replay with curl (illustrative body):

```bash
curl -X POST http://localhost:3000/webhooks/rapidapi \
  -H "Content-Type: application/json" \
  -H "x-rapidapi-webhook-secret: $RAPIDAPI_WEBHOOK_SECRET" \
  -d '{"eventType":"API Created"}'
```

## Hookdeck

The Hookdeck source type is **RapidAPI**. Hookdeck compares the whole `x-rapidapi-webhook-secret`
header with the key you configure on the source. Setup note: "Covers Enterprise Hub events only."
