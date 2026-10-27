# Cuuro Webhooks Overview

## What Are Cuuro Webhooks?

[Cuuro](https://cuuro.ai) is an AI due-diligence platform for investors. Its API integrations can send a webhook when a target company or an analysis is created, and when an analysis completes. A webhook is a JSON `POST` to the URL you register on the integration. Cuuro states that it uses [Svix](https://svix.com) to send webhooks, so each request carries `svix-id`, `svix-timestamp` and `svix-signature` headers.

## What Are the Common Event Types?

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `startup.created` | A new target company is created (via the API's target-companies endpoint). `data.id` is the company id | Sync the company into your CRM or deal tracker |
| `analysis.created` | A new analysis is created (via the API's analysis endpoint). `data.id` is the analysis id | Track that an analysis was queued |
| `analysis.completed` | An analysis finishes. `data.id` is the analysis id | Fetch the results with the Cuuro API, notify the deal team |

These are the 3 events Cuuro documents; the list may not be exhaustive, so ignore types you don't recognise.

## Event Payload Structure

The body is a JSON object with the event name at the top level, beside `data`:

```json
{
  "data": {
    "id": "0191e29a-1644-7972-9466-18ada4a3636e"
  },
  "event": "analysis.completed"
}
```

- `event`: the event type string (the same field is used for all three events).
- `data.id`: the id of the company (`startup.created`) or analysis (`analysis.*`). The payload carries only the id, so call the Cuuro API to fetch the full resource.

## Delivery

Cuuro's documentation states no acknowledgement requirement, timeout or retry schedule. Return a `2xx` quickly, process asynchronously, and deduplicate on `svix-id` (stable across retries).

## Full Event Reference

See Cuuro's [webhooks guide](https://docs.cuuro.ai/integrations/webhooks).
