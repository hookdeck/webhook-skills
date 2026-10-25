# Metabase Webhooks Overview

## What Are Metabase Webhooks?

Metabase can send the results of an alert to a webhook: your app, a third-party service, or any
HTTP endpoint. An admin (or someone with settings access) creates the webhook under
**Admin > Settings > Webhooks**, and people then pick it as a recipient when they set up an alert
on a question. For now webhooks work for **alerts only**; they can't be a recipient of a
dashboard subscription.

Requests are `POST` with a JSON body. Webhooks are not signed. Authentication is configured on the
webhook (None, Basic, Bearer or API key); this skill uses **Basic**.

## Event Types

There is a single payload type:

| `type` | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `alert` | An alert on a question fires, or someone sends a test alert (`alert_id` is `null`) | Post results to chat or on-call, store `raw_data`, kick off a workflow |

## Event Payload Structure

```json
{
  "type": "alert",
  "alert_id": 12,
  "alert_creator_id": 2666,
  "alert_creator_name": "Roberto Bolaño",
  "data": {
    "type": "question",
    "question_id": 108,
    "question_name": "Sales",
    "question_url": "https://example.com/question/108",
    "visualization": "data:image/png;base64,...",
    "raw_data": {
      "cols": ["CREATED_AT", "count"],
      "rows": [["2024-08-01T00:00:00Z", 501]]
    }
  },
  "sent_at": "2024-09-30T20:16:15.76582Z"
}
```

- `visualization` is the attached chart as a base64-encoded PNG data URI. It can make the body
  large, so raise your framework's body-size limit (Express's `raw` default is 100kb).
- `raw_data` is the table view of the results (`cols` and `rows`).
- `alert_id` is `null` for test alerts.

## Full Event Reference

See [Metabase's webhook documentation](https://www.metabase.com/docs/latest/configuring-metabase/webhooks).
